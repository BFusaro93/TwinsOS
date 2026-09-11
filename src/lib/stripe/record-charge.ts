import type Stripe from "stripe";
import { getStripeForOrg } from "@/lib/stripe/server";
import { methodForPaymentIntent, decodeAllocations } from "@/lib/stripe/crm-payments";
import { isoNy } from "@/lib/reports/ny-date";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { logger } from "@/lib/logger";

const log = logger.child("stripe record charge");

/**
 * The single place a succeeded Stripe PaymentIntent becomes a `crm_payments`
 * row + `crm_payment_allocations` + an applied invoice balance.
 *
 * WHY THIS EXISTS: this used to live only inside the Connect webhook
 * (src/app/api/crm/payments/connect-webhook/route.ts). That made the webhook
 * the *only* thing that ever recorded a card payment — so a webhook outage, a
 * rotated/misconfigured signing secret, or a wrong endpoint URL meant the
 * customer's card was charged at Stripe and the business had no record of it
 * at all (the invoice just stayed Overdue). That happened live.
 *
 * Now the routes that confirm a charge off-session and get back a terminal
 * `succeeded` status record it synchronously, and the webhook is an
 * idempotent backstop that no-ops if the synchronous write already landed
 * (and remains the *only* applier for browser-confirmed intents from
 * create-intent / create-intent-multi, and for ACH, which settles days later).
 *
 * IDEMPOTENCY: keyed on the Stripe PaymentIntent id via the unique partial
 * index `crm_payments_stripe_payment_intent_id_idx`. Both writers race the
 * same INSERT; the loser gets a 23505 unique violation and returns
 * "already_recorded" without touching invoice balances. This is enforced by
 * the database, not by a read-then-write check, so it is safe under genuine
 * concurrency (webhook and route landing at the same instant).
 */
export type RecordStripeChargeResult = "applied" | "already_recorded" | "skipped" | "error";

// any: the generated Supabase types don't cover every table this touches
// (crm_payment_allocations, client_activity) — same pattern as the webhook
// this logic was extracted from.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
type AnySupabase = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RecordStripeChargeArgs {
  /** Service-role Supabase client (writes bypass RLS — org scoping is enforced
   * by the connected-account ownership check below, not by the caller's session). */
  db: Db;
  /** Same client, untyped-passthrough for fireSimpleTrigger. */
  supabase: AnySupabase;
  paymentIntent: Stripe.PaymentIntent;
  /** The connected account the charge actually happened on. For the webhook
   * this is `event.account`; for a synchronous charge route it is the account
   * the PaymentIntent was created against. */
  connectedAccountId: string | null | undefined;
}

/** A Standard connected account is a full, independent Stripe account — its
 * owner can call the Stripe API directly and create a PaymentIntent with
 * ARBITRARY metadata (including another org's org_id/invoice_id). Never trust
 * PaymentIntent.metadata.org_id on its own: confirm the account the charge
 * actually happened on is the one on file for that org first. */
export async function accountOwnedByOrg(db: Db, orgId: string, account: string): Promise<boolean> {
  const { data } = await db
    .from("organizations")
    .select("stripe_connect_account_id")
    .eq("id", orgId)
    .single();
  return data?.stripe_connect_account_id === account;
}

/** Which platform key (live/test) to use for further API calls scoped to this
 * org's connected account (e.g. `stripe.charges.list({ stripeAccount: ... })`)
 * — mirrors getStripeForOrg()'s livemode contract. */
async function stripeForOrgConnectedAccount(db: Db, orgId: string): Promise<Stripe> {
  const { data } = await db
    .from("organizations")
    .select("stripe_connect_livemode")
    .eq("id", orgId)
    .single();
  return getStripeForOrg(data?.stripe_connect_livemode ?? null);
}

export async function resolveMethod(
  db: Db,
  orgId: string,
  paymentIntent: Stripe.PaymentIntent,
  connectedAccountId: string
): Promise<{ method: string; isAch: boolean }> {
  const isAch = paymentIntent.payment_method_types.includes("us_bank_account");
  let cardBrand: string | null = null;
  if (!isAch) {
    try {
      // Resolve the client matching this org's livemode rather than whichever
      // key happened to verify a webhook signature — the sandbox org's
      // connected account lives under the test-mode platform key.
      const orgStripe = await stripeForOrgConnectedAccount(db, orgId);
      const charges = await orgStripe.charges.list(
        { payment_intent: paymentIntent.id, limit: 1 },
        { stripeAccount: connectedAccountId }
      );
      cardBrand = charges.data[0]?.payment_method_details?.card?.brand ?? null;
    } catch {
      cardBrand = null;
    }
  }
  return { method: methodForPaymentIntent(paymentIntent.payment_method_types, cardBrand), isAch };
}

/**
 * Records a succeeded PaymentIntent against its invoice(s). Dispatches on
 * `metadata.source`: `crm_invoice` (single) or `crm_invoice_multi` (one charge
 * split across several invoices for the same client).
 *
 * Returns "skipped" for anything that isn't a succeeded CRM invoice intent —
 * notably an ACH intent still in `processing`, which must not be recorded
 * until it actually settles (the webhook records it then).
 */
export async function recordStripeCharge(args: RecordStripeChargeArgs): Promise<RecordStripeChargeResult> {
  const { paymentIntent } = args;

  // ACH confirms as `processing` and only reaches `succeeded` days later, and
  // a card intent can come back `requires_action`. Only a terminal success is
  // real money in the bank — anything else stays the webhook's job.
  if (paymentIntent.status !== "succeeded") return "skipped";

  const source = paymentIntent.metadata?.source;
  if (source === "crm_invoice_multi") return recordMultiInvoiceCharge(args);
  if (source === "crm_invoice") return recordSingleInvoiceCharge(args);
  return "skipped";
}

async function recordSingleInvoiceCharge({
  db,
  supabase,
  paymentIntent,
  connectedAccountId,
}: RecordStripeChargeArgs): Promise<RecordStripeChargeResult> {
  if (!connectedAccountId) {
    log.error("succeeded payment intent with no connected account", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  const { org_id: orgId, invoice_id: invoiceId, client_id: clientId } = paymentIntent.metadata;
  const balanceCents = parseInt(paymentIntent.metadata.balance_cents, 10);
  const feeCents = parseInt(paymentIntent.metadata.fee_cents, 10);

  if (!orgId || !invoiceId || !clientId || !Number.isFinite(balanceCents) || !Number.isFinite(feeCents)) {
    log.error("missing/invalid metadata on payment intent", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  if (!(await accountOwnedByOrg(db, orgId, connectedAccountId))) {
    log.error("payment intent metadata org_id does not own the connected account the charge fired on", {
      paymentIntentId: paymentIntent.id,
      orgId,
      connectedAccountId,
    });
    return "error";
  }

  const { method, isAch } = await resolveMethod(db, orgId, paymentIntent, connectedAccountId);

  // `balanceCents` is the balance the intent was created against, captured at
  // create-intent time — if a second PaymentIntent for the same invoice was
  // created before the first settled (e.g. the customer opened the pay link
  // on two devices), both can genuinely succeed as real charges, each
  // quoting the FULL balance owed at creation time. Re-check the invoice's
  // actual remaining balance right before applying this payment and clamp to
  // it, crediting any excess as unused/prepayment credit.
  const { data: invoiceBefore, error: invoiceBeforeErr } = await db
    .from("crm_invoices")
    .select("total_cents, amount_paid_cents, status")
    .eq("id", invoiceId)
    .eq("org_id", orgId)
    .single();
  if (invoiceBeforeErr) {
    log.error("failed to load invoice before applying payment", {
      error: invoiceBeforeErr,
      paymentIntentId: paymentIntent.id,
    });
    return "error";
  }

  const currentBalanceCents = Math.max(0, invoiceBefore.total_cents - invoiceBefore.amount_paid_cents);
  const appliedCents = Math.min(balanceCents, currentBalanceCents);
  const overpaidCents = balanceCents - appliedCents;

  const { data: inserted, error: insertErr } = await db
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: invoiceId,
      client_id: clientId,
      amount_cents: balanceCents,
      unused_amount_cents: overpaidCents,
      payment_date: isoNy(new Date()),
      method,
      memo:
        overpaidCents > 0
          ? `Paid online via ${isAch ? "bank transfer" : "card"} (exceeds invoice balance — excess credited to account)`
          : `Paid online via ${isAch ? "bank transfer" : "card"}`,
      is_prepayment: false,
      processing_fee_cents: feeCents,
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // This PaymentIntent is already recorded — either the synchronous charge
      // route beat the webhook to it, or Stripe retried the delivery. The
      // unique index on stripe_payment_intent_id is what makes the two writers
      // safe to run concurrently: the loser lands here and touches nothing.
      return "already_recorded";
    }
    log.error("failed to insert crm_payments", { error: insertErr, paymentIntentId: paymentIntent.id });
    return "error";
  }

  try {
    // Row-locked (SELECT ... FOR UPDATE inside the RPC) so a concurrent
    // recording/edit/refund against this same invoice can't read the same
    // stale amount_paid_cents and clobber this write.
    const { data: rpcResult, error: rpcErr } = await db.rpc("apply_payment_to_invoice", {
      p_invoice_id: invoiceId,
      p_delta_cents: appliedCents,
    });
    if (rpcErr) throw rpcErr;
    const wasNewlyPaid = !!rpcResult?.[0]?.was_newly_paid;

    if (wasNewlyPaid) {
      await fireSimpleTrigger(supabase, { orgId, clientId, invoiceId, triggerType: "invoice_paid" });
    }

    if (appliedCents > 0) {
      const { error: allocErr } = await db
        .from("crm_payment_allocations")
        .insert({ org_id: orgId, payment_id: inserted.id, invoice_id: invoiceId, amount_cents: appliedCents });
      if (allocErr) throw allocErr;
    }

    await db.rpc("sync_client_balance", { p_client_id: clientId });

    await db.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${method} (online)${overpaidCents > 0 ? " — partly credited to account" : ""}`,
      amount_cents: balanceCents,
      ref_id: inserted.id,
      ref_table: "crm_payments",
    });
  } catch (err) {
    log.error("recorded payment but failed to apply it", { error: err, paymentId: inserted.id });
    return "error";
  }

  return "applied";
}

/** One charge split across several invoices for the same client — mirrors the
 * single-invoice path but loops the invoice update + allocation insert under a
 * single crm_payments row, the same way a manually-recorded multi-invoice
 * payment is split via crm_payment_allocations. */
async function recordMultiInvoiceCharge({
  db,
  supabase,
  paymentIntent,
  connectedAccountId,
}: RecordStripeChargeArgs): Promise<RecordStripeChargeResult> {
  if (!connectedAccountId) {
    log.error("succeeded payment intent with no connected account", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  const { org_id: orgId, client_id: clientId, allocations: encodedAllocations } = paymentIntent.metadata;
  const feeCents = parseInt(paymentIntent.metadata.fee_cents, 10);

  if (!orgId || !clientId || !encodedAllocations || !Number.isFinite(feeCents)) {
    log.error("missing/invalid metadata on multi-invoice payment intent", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  if (!(await accountOwnedByOrg(db, orgId, connectedAccountId))) {
    log.error("payment intent metadata org_id does not own the connected account the charge fired on", {
      paymentIntentId: paymentIntent.id,
      orgId,
      connectedAccountId,
    });
    return "error";
  }

  const allocations = decodeAllocations(encodedAllocations);
  const totalCents = allocations.reduce((sum, a) => sum + a.amountCents, 0);

  const { method, isAch } = await resolveMethod(db, orgId, paymentIntent, connectedAccountId);

  // Re-check each allocated invoice's actual remaining balance right before
  // applying this payment and clamp each allocation to it, crediting any
  // excess as unused/prepayment credit — same race and same fix as the
  // single-invoice path above.
  const clampedAllocations: { invoiceId: string; amountCents: number }[] = [];
  let overpaidCents = 0;
  for (const alloc of allocations) {
    // Scoped by client_id as well as org_id/id: metadata.client_id and the encoded
    // allocation list are two independently-editable metadata keys on a PaymentIntent
    // a connected account's own owner can forge — this stops a same-org mismatch
    // between the two from applying one client's charge to another client's invoice.
    const { data: invoice, error: invoiceErr } = await db
      .from("crm_invoices")
      .select("total_cents, amount_paid_cents")
      .eq("id", alloc.invoiceId)
      .eq("org_id", orgId)
      .eq("client_id", clientId)
      .single();
    if (invoiceErr) {
      log.error("failed to load invoice before applying multi-invoice payment", {
        error: invoiceErr,
        paymentIntentId: paymentIntent.id,
      });
      return "error";
    }

    const currentBalanceCents = Math.max(0, invoice.total_cents - invoice.amount_paid_cents);
    const appliedCents = Math.min(alloc.amountCents, currentBalanceCents);
    clampedAllocations.push({ invoiceId: alloc.invoiceId, amountCents: appliedCents });
    overpaidCents += alloc.amountCents - appliedCents;
  }

  const { data: inserted, error: insertErr } = await db
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: allocations.length === 1 ? allocations[0].invoiceId : null,
      client_id: clientId,
      amount_cents: totalCents,
      unused_amount_cents: overpaidCents,
      payment_date: isoNy(new Date()),
      method,
      memo:
        overpaidCents > 0
          ? `Paid online via ${isAch ? "bank transfer" : "card"} (exceeds invoice balance — excess credited to account)`
          : `Paid online via ${isAch ? "bank transfer" : "card"}`,
      is_prepayment: false,
      processing_fee_cents: feeCents,
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Already recorded (synchronous route beat the webhook, or a retried
      // delivery). Nothing below has run yet, so no allocation or invoice
      // balance has been touched — a clean no-op.
      return "already_recorded";
    }
    log.error("failed to insert crm_payments", { error: insertErr, paymentIntentId: paymentIntent.id });
    return "error";
  }

  try {
    const newlyPaidInvoiceIds: string[] = [];

    for (const alloc of clampedAllocations) {
      // Row-locked via apply_payment_to_invoice() instead of a manual
      // read-then-write — two concurrent payments landing on the same invoice
      // must serialize, not race on a stale amount_paid_cents read.
      const { data: rpcResult, error: rpcErr } = await db.rpc("apply_payment_to_invoice", {
        p_invoice_id: alloc.invoiceId,
        p_delta_cents: alloc.amountCents,
      });
      if (rpcErr) throw rpcErr;
      const wasNewlyPaid = !!rpcResult?.[0]?.was_newly_paid;

      if (wasNewlyPaid) newlyPaidInvoiceIds.push(alloc.invoiceId);

      if (alloc.amountCents > 0) {
        const { error: allocErr } = await db
          .from("crm_payment_allocations")
          .insert({ org_id: orgId, payment_id: inserted.id, invoice_id: alloc.invoiceId, amount_cents: alloc.amountCents });
        if (allocErr) throw allocErr;
      }
    }

    for (const invoiceId of newlyPaidInvoiceIds) {
      await fireSimpleTrigger(supabase, { orgId, clientId, invoiceId, triggerType: "invoice_paid" });
    }

    await db.rpc("sync_client_balance", { p_client_id: clientId });

    await db.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${method} (online) — ${allocations.length} invoices${overpaidCents > 0 ? ", partly credited to account" : ""}`,
      amount_cents: totalCents,
      ref_id: inserted.id,
      ref_table: "crm_payments",
    });
  } catch (err) {
    log.error("recorded multi-invoice payment but failed to apply it", { error: err, paymentId: inserted.id });
    return "error";
  }

  return "applied";
}
