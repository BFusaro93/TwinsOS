import type Stripe from "stripe";
import { getStripeForOrg } from "@/lib/stripe/server";
import { logger } from "@/lib/logger";

const log = logger.child("stripe open intent");

/*
 * One open PaymentIntent per invoice for the customer pay forms (public pay
 * link, portal single + combined payment).
 *
 * Without this, every "Pay" click minted a new intent. A customer with the pay
 * page open in two tabs (or an old tab from yesterday) had two live forms; both
 * could be confirmed, and the second payment only survived as unapplied credit
 * because record_stripe_invoice_payment clamps to the live balance. Now:
 *  - the same request (same invoices, amount and method) gets the SAME intent
 *    back — Stripe charges a PaymentIntent at most once;
 *  - a different request (amount changed, method switched, different invoice
 *    selection) cancels the old one at Stripe, so its form can't be submitted;
 *  - any other change that makes an open form stale (staff record a payment,
 *    a saved card is charged, the invoice is voided, deleted, merged or its
 *    total edited) queues the intent in crm_payment_intent_cancellations via a
 *    database trigger, and drainIntentCancellations() cancels it at Stripe.
 * The RPC clamp stays as the last line of defence for anything that slips
 * between those (e.g. a form submitted in the seconds before the drain runs).
 *
 * The pointer lives in crm_open_payment_intents rather than on crm_invoices so
 * opening a pay form doesn't write an audit-trail entry on the invoice.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the new tables aren't in the generated Supabase types */
type Db = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** States in which a customer could still submit the form. A bank account
 * waiting on micro-deposit verification is excluded on purpose: that payment
 * is already submitted (see cancelMicrodepositIntents in duplicate-charge.ts). */
function isOpenForm(pi: Stripe.PaymentIntent): boolean {
  if (pi.status === "requires_payment_method" || pi.status === "requires_confirmation") return true;
  return pi.status === "requires_action" && pi.next_action?.type !== "verify_with_microdeposits";
}

async function forgetIntent(db: Db, orgId: string, paymentIntentId: string): Promise<void> {
  const { error } = await db
    .from("crm_open_payment_intents")
    .delete()
    .eq("org_id", orgId)
    .eq("payment_intent_id", paymentIntentId);
  if (error) log.error("failed to clear an open payment intent pointer", { error, paymentIntentId });
}

async function queueCancellation(db: Db, orgId: string, paymentIntentId: string, reason: string): Promise<void> {
  const { error } = await db
    .from("crm_payment_intent_cancellations")
    .upsert({ org_id: orgId, payment_intent_id: paymentIntentId, reason }, { onConflict: "payment_intent_id", ignoreDuplicates: true });
  if (error) log.error("failed to queue a payment intent for cancellation", { error, paymentIntentId });
}

export interface OpenIntentRequest {
  stripe: Stripe;
  connectedAccountId: string;
  /** Service-role client. */
  db: Db;
  orgId: string;
  /** Every invoice the new payment covers. */
  invoiceIds: string[];
  /** The total the intent would charge, fee included. */
  amountCents: number;
  paymentMethod: "card" | "us_bank_account";
  /** Metadata keys the open intent must carry with exactly these values to be
   * handed back (e.g. balance_cents, allocations, client_id). */
  metadata: Record<string, string>;
}

/**
 * Looks at the open intents already pointing at these invoices. Returns one to
 * hand back when it is for exactly this payment; cancels (at Stripe) every
 * other one that could still be submitted. Never throws: a lookup failure
 * queues the intent for the background cancel and falls through to "create a
 * new one".
 *
 * `supersededIds` lists every intent this call canceled (or found dead). The
 * caller puts them in the new intent's idempotency key: without that, a client
 * switching card -> bank -> card inside chargeIdempotencyKey's 10-second
 * window got the first card intent back from Stripe's idempotency cache —
 * already canceled by the switch to bank, so the form could never be paid.
 */
export async function reuseOrCancelOpenIntent(
  req: OpenIntentRequest
): Promise<{ reusable: Stripe.PaymentIntent | null; supersededIds: string[] }> {
  const { stripe, connectedAccountId, db, orgId, invoiceIds, amountCents, paymentMethod, metadata } = req;
  const supersededIds: string[] = [];
  if (invoiceIds.length === 0) return { reusable: null, supersededIds };

  const { data: rows, error } = await db
    .from("crm_open_payment_intents")
    .select("invoice_id, payment_intent_id")
    .eq("org_id", orgId)
    .in("invoice_id", invoiceIds);
  if (error) {
    log.error("failed to read open payment intents", { error, invoiceIds });
    return { reusable: null, supersededIds };
  }
  const intentIds = [...new Set(((rows ?? []) as { payment_intent_id: string }[]).map((r) => r.payment_intent_id))];

  let reusable: Stripe.PaymentIntent | null = null;
  for (const intentId of intentIds) {
    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(intentId, undefined, { stripeAccount: connectedAccountId });
    } catch (err) {
      log.error("failed to read an open payment intent; queued for cancellation", { error: err, paymentIntentId: intentId });
      await queueCancellation(db, orgId, intentId, "unreadable when a new payment was started");
      await forgetIntent(db, orgId, intentId);
      supersededIds.push(intentId);
      continue;
    }
    if (!isOpenForm(pi)) {
      // Submitted (processing / held / succeeded) or dead: not ours to touch here.
      // An in-flight one was already refused by refuseIfChargeInFlight.
      if (pi.status === "canceled" || pi.status === "succeeded") await forgetIntent(db, orgId, intentId);
      if (pi.status === "canceled") supersededIds.push(intentId);
      continue;
    }

    // Exactly the invoices of this request — no more, no fewer.
    const { data: covered } = await db
      .from("crm_open_payment_intents")
      .select("invoice_id")
      .eq("org_id", orgId)
      .eq("payment_intent_id", intentId);
    const coveredIds = new Set(((covered ?? []) as { invoice_id: string }[]).map((r) => r.invoice_id));
    const sameInvoices = coveredIds.size === invoiceIds.length && invoiceIds.every((id) => coveredIds.has(id));
    const sameAmount = pi.amount === amountCents;
    const sameMethod = pi.payment_method_types.length === 1 && pi.payment_method_types[0] === paymentMethod;
    const sameMetadata = Object.entries(metadata).every(([k, v]) => pi.metadata?.[k] === v);

    if (!reusable && sameInvoices && sameAmount && sameMethod && sameMetadata) {
      reusable = pi;
      continue;
    }

    // A form for a different amount / method / selection: cancel it so it can
    // never be submitted alongside the one about to be created.
    supersededIds.push(intentId);
    try {
      await stripe.paymentIntents.cancel(intentId, {}, { stripeAccount: connectedAccountId });
    } catch (err) {
      log.error("failed to cancel a stale open payment intent; queued", { error: err, paymentIntentId: intentId });
      await queueCancellation(db, orgId, intentId, "superseded by a new payment");
    }
    await forgetIntent(db, orgId, intentId);
  }
  return { reusable, supersededIds: supersededIds.sort() };
}

/** Records the intent a pay form is now open on, for each invoice it covers.
 * Best-effort: a missed pointer only degrades to the old behaviour. */
export async function rememberOpenIntent(db: Db, orgId: string, invoiceIds: string[], paymentIntentId: string): Promise<void> {
  if (invoiceIds.length === 0) return;
  const { error } = await db.from("crm_open_payment_intents").upsert(
    invoiceIds.map((invoiceId) => ({ org_id: orgId, invoice_id: invoiceId, payment_intent_id: paymentIntentId })),
    { onConflict: "invoice_id" }
  );
  if (error) log.error("failed to remember the open payment intent", { error, paymentIntentId, invoiceIds });
}

/** Drops the pointer for an intent that has been submitted, settled or died. */
export async function forgetOpenIntent(db: Db, paymentIntentId: string): Promise<void> {
  const { error } = await db.from("crm_open_payment_intents").delete().eq("payment_intent_id", paymentIntentId);
  if (error) log.error("failed to clear an open payment intent pointer", { error, paymentIntentId });
}

const MAX_CANCEL_ATTEMPTS = 5;

/**
 * Cancels the open intents a database trigger queued because their invoice
 * changed underneath them (paid, voided, deleted, merged, total edited).
 * Only intents a customer could still submit are canceled; one already
 * submitted (processing, held for capture, succeeded) is left alone — it is
 * real money and is recorded (and clamped) as usual. Runs from the 5-minute
 * cron and right after the payment paths that change invoice balances.
 * Never throws.
 */
export async function drainIntentCancellations(db: Db, opts: { orgId?: string; limit?: number } = {}): Promise<{ canceled: number; failed: number }> {
  let canceled = 0;
  let failed = 0;
  try {
    let query = db
      .from("crm_payment_intent_cancellations")
      .select("id, org_id, payment_intent_id, attempts")
      .is("processed_at", null)
      .lt("attempts", MAX_CANCEL_ATTEMPTS)
      .order("created_at", { ascending: true })
      .limit(opts.limit ?? 50);
    if (opts.orgId) query = query.eq("org_id", opts.orgId);
    const { data: queued, error } = await query;
    if (error) {
      log.error("failed to read the payment intent cancellation queue", { error });
      return { canceled, failed };
    }
    const rows = (queued ?? []) as { id: string; org_id: string; payment_intent_id: string; attempts: number }[];
    if (rows.length === 0) return { canceled, failed };

    const orgIds = [...new Set(rows.map((r) => r.org_id))];
    const { data: orgs } = await db
      .from("organizations")
      .select("id, stripe_connect_account_id, stripe_connect_livemode")
      .in("id", orgIds);
    const orgById = new Map(
      ((orgs ?? []) as { id: string; stripe_connect_account_id: string | null; stripe_connect_livemode: boolean | null }[]).map((o) => [o.id, o])
    );

    for (const row of rows) {
      const org = orgById.get(row.org_id);
      const now = new Date().toISOString();
      if (!org?.stripe_connect_account_id) {
        await db.from("crm_payment_intent_cancellations").update({ processed_at: now, last_error: "no connected Stripe account" }).eq("id", row.id);
        continue;
      }
      try {
        const stripe = getStripeForOrg(org.stripe_connect_livemode);
        const pi = await stripe.paymentIntents.retrieve(row.payment_intent_id, undefined, { stripeAccount: org.stripe_connect_account_id });
        // A bank payment still waiting on micro-deposit verification can be
        // submitted later too, so it is canceled along with the open forms.
        const cancelable =
          pi.status === "requires_payment_method" || pi.status === "requires_confirmation" || pi.status === "requires_action";
        if (cancelable) {
          await stripe.paymentIntents.cancel(pi.id, {}, { stripeAccount: org.stripe_connect_account_id });
          canceled++;
        }
        await db.from("crm_payment_intent_cancellations").update({ processed_at: now, last_error: null }).eq("id", row.id);
        await forgetOpenIntent(db, row.payment_intent_id);
      } catch (err) {
        failed++;
        const code = (err as { code?: string } | null)?.code;
        const message = err instanceof Error ? err.message : String(err);
        // Gone at Stripe (wrong account after a reconnect, deleted): nothing to cancel.
        const terminal = code === "resource_missing";
        await db
          .from("crm_payment_intent_cancellations")
          .update({ attempts: row.attempts + 1, last_error: message.slice(0, 500), ...(terminal ? { processed_at: now } : {}) })
          .eq("id", row.id);
        log.error("failed to cancel a stale payment intent", { error: err, paymentIntentId: row.payment_intent_id, orgId: row.org_id });
      }
    }
  } catch (err) {
    log.error("payment intent cancellation drain failed", { error: err });
  }
  return { canceled, failed };
}
