import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import {
  accountOwnedByOrg,
  resolveMethod,
  type RecordStripeChargeResult,
} from "@/lib/stripe/record-charge";

const log = logger.child("stripe estimate deposit");

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Flags an estimate as having a deposit submitted but not yet settled — an
 * ACH debit sits in `processing` for days and writes nothing to crm_payments
 * until it clears, so without this the estimate is indistinguishable from one
 * where the client skipped the deposit entirely. */
export async function markEstimateDepositPending(
  db: Db,
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  const estimateId = paymentIntent.metadata?.estimate_id;
  const orgId = paymentIntent.metadata?.org_id;
  if (!estimateId || !orgId) return;
  const { error } = await db
    .from("estimates")
    .update({
      deposit_pending_intent_id: paymentIntent.id,
      deposit_pending_cents: Number(paymentIntent.metadata?.deposit_cents) || paymentIntent.amount,
      deposit_pending_method: paymentIntent.payment_method_types.includes("us_bank_account")
        ? "us_bank_account"
        : "card",
      deposit_pending_at: new Date().toISOString(),
    })
    .eq("id", estimateId)
    .eq("org_id", orgId);
  if (error) {
    log.error("failed to mark the estimate deposit as pending", { error, paymentIntentId: paymentIntent.id });
  }
}

/** Clears the pending marker for a deposit intent that died (failed or was
 * canceled). Matched on the intent id so it is idempotent and can never
 * clobber a newer marker. */
export async function clearEstimateDepositPending(
  db: Db,
  paymentIntentId: string
): Promise<void> {
  const { error } = await db
    .from("estimates")
    .update({
      deposit_pending_intent_id: null,
      deposit_pending_cents: null,
      deposit_pending_method: null,
      deposit_pending_at: null,
    })
    .eq("deposit_pending_intent_id", paymentIntentId);
  if (error) {
    log.error("failed to clear the pending deposit marker", { error, paymentIntentId });
  }
}

/**
 * Records a deposit attempt the bank or card network rejected, and returns
 * what a notification needs to name it.
 *
 * An ACH debit can bounce days after the proposal was accepted. Until this
 * existed the webhook cleared the pending marker and returned 200, so the
 * estimate reverted to looking like one where the client simply skipped the
 * deposit — no record, nobody told, and no way for the client to try again.
 *
 * Returns null when this isn't a recordable failure, in which case the caller
 * should fall back to just clearing the pending marker. Four cases:
 *
 *  - missing metadata, or an estimate that has since been deleted;
 *  - a deposit that has meanwhile been COLLECTED. Stripe redelivers, and
 *    events can arrive out of order; a stale payment_failed must never
 *    un-collect a good deposit;
 *  - a NEWER attempt already in flight (deposit_pending_intent_id names a
 *    different intent). The client has retried; recording the old failure
 *    would clobber the new pending marker and re-open a link that is already
 *    being paid;
 *  - the proposal has not been ACCEPTED yet. A card declined during the
 *    initial deposit step fires this same event, but the client is sitting on
 *    the page looking at the decline message and will either retry or skip.
 *    Nothing has gone wrong behind anyone's back, so notifying staff would be
 *    pure noise. Only a failure that lands after acceptance — which is every
 *    ACH return, since acceptance deliberately doesn't wait for settlement —
 *    is something nobody would otherwise find out about.
 */
export async function recordEstimateDepositFailure(
  db: Db,
  paymentIntent: Stripe.PaymentIntent
): Promise<{
  orgId: string;
  estimateId: string;
  estimateNumber: number | null;
  clientId: string | null;
  clientName: string | null;
  salesRepId: string | null;
  amountCents: number;
  method: "card" | "us_bank_account";
  reason: string;
} | null> {
  const estimateId = paymentIntent.metadata?.estimate_id;
  const orgId = paymentIntent.metadata?.org_id;
  if (!estimateId || !orgId) return null;

  const { data: estimate } = await db
    .from("estimates")
    .select(
      "id, estimate_number, client_id, sales_rep_id, deposit_collected_cents, deposit_pending_intent_id, clients(display_name)"
    )
    .eq("id", estimateId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!estimate) return null;
  if ((estimate.deposit_collected_cents ?? 0) > 0) return null;
  if (
    estimate.deposit_pending_intent_id &&
    estimate.deposit_pending_intent_id !== paymentIntent.id
  ) {
    return null;
  }

  // Accepted yet? See the fourth case in the doc comment. Any token for this
  // estimate carrying accepted_at means the client is past the live flow.
  const { data: acceptedToken } = await db
    .from("estimate_share_tokens")
    .select("id")
    .eq("estimate_id", estimateId)
    .eq("org_id", orgId)
    .not("accepted_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (!acceptedToken) return null;

  const method = paymentIntent.payment_method_types.includes("us_bank_account")
    ? ("us_bank_account" as const)
    : ("card" as const);
  // Stripe's own wording is the most accurate thing available, and for an ACH
  // return it carries the distinction that decides what staff do next
  // ("insufficient funds" → ask them to retry; "account closed" → call them).
  const reason =
    paymentIntent.last_payment_error?.message?.trim() ||
    (method === "us_bank_account"
      ? "The bank returned the transfer."
      : "The card was declined.");
  const amountCents =
    Number.parseInt(paymentIntent.metadata?.deposit_cents ?? "", 10) || paymentIntent.amount;

  const { error } = await db
    .from("estimates")
    .update({
      deposit_failed_at: new Date().toISOString(),
      deposit_failed_cents: amountCents,
      deposit_failed_method: method,
      deposit_failed_reason: reason,
      // The attempt is over — drop the in-flight marker in the same write, so
      // the estimate can never show "deposit on its way" and "deposit failed"
      // at once.
      deposit_pending_intent_id: null,
      deposit_pending_cents: null,
      deposit_pending_method: null,
      deposit_pending_at: null,
    })
    .eq("id", estimateId)
    .eq("org_id", orgId);
  if (error) {
    log.error("failed to record the deposit failure", { error, paymentIntentId: paymentIntent.id });
    return null;
  }

  const client = estimate.clients as { display_name?: string } | null;
  return {
    orgId,
    estimateId,
    estimateNumber: estimate.estimate_number ?? null,
    clientId: estimate.client_id ?? null,
    clientName: client?.display_name ?? null,
    salesRepId: estimate.sales_rep_id ?? null,
    amountCents,
    method,
    reason,
  };
}

export interface RecordEstimateDepositArgs {
  /** Service-role client. Org scoping comes from the connected-account
   * ownership check below, not from a caller session. */
  db: Db;
  paymentIntent: Stripe.PaymentIntent;
  /** The connected account the charge actually happened on (event.account). */
  connectedAccountId: string | null | undefined;
}

/**
 * Records a succeeded proposal-deposit charge as an UNAPPLIED PREPAYMENT on
 * the client's account.
 *
 * A deposit is taken at the moment a proposal is accepted, which is before any
 * invoice for the work exists — so there is nothing to allocate it against.
 * It lands as a crm_payments row with no invoice_id, is_prepayment = true and
 * the whole amount in unused_amount_cents, i.e. account credit. The first
 * invoice raised for that client is then settled against it the same way any
 * other prepayment is, and it shows on the client's balance in the meantime.
 *
 * This is the ONLY writer for these charges. Unlike the invoice paths there is
 * no synchronous "record it in the route too" twin: the client's browser is
 * mid-acceptance and may never come back, and a single writer means a
 * half-recorded charge is impossible. Idempotency is the same database-enforced
 * unique index on crm_payments.stripe_payment_intent_id, so a Stripe retry or a
 * replayed webhook no-ops.
 */
export async function recordEstimateDepositCharge({
  db,
  paymentIntent,
  connectedAccountId,
}: RecordEstimateDepositArgs): Promise<RecordStripeChargeResult> {
  if (paymentIntent.metadata?.source !== "crm_estimate_deposit") return "skipped";
  if (paymentIntent.status !== "succeeded") return "skipped";

  const orgId = paymentIntent.metadata?.org_id;
  const estimateId = paymentIntent.metadata?.estimate_id;
  if (!orgId || !estimateId || !connectedAccountId) {
    log.error("estimate deposit intent is missing org_id/estimate_id/account", {
      paymentIntentId: paymentIntent.id,
    });
    return "error";
  }

  // A Standard connected account's owner can create a PaymentIntent with any
  // metadata they like, including another org's ids. Never trust
  // metadata.org_id on its own — confirm the account the charge fired on
  // actually belongs to that org (same guard as recordStripeCharge).
  if (!(await accountOwnedByOrg(db, orgId, connectedAccountId))) {
    log.error("estimate deposit metadata org_id does not own the connected account", {
      paymentIntentId: paymentIntent.id,
      orgId,
      connectedAccountId,
    });
    return "error";
  }

  // client_id is read from the estimate rather than the metadata, so a forged
  // client_id can't attach someone else's credit to the wrong account.
  const { data: estimate, error: estErr } = await db
    .from("estimates")
    .select("id, org_id, client_id, estimate_number, deposit_required_cents, deposit_collected_cents, deposit_reference")
    .eq("id", estimateId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .single();
  if (estErr || !estimate) {
    log.error("estimate deposit charge has no matching estimate", { paymentIntentId: paymentIntent.id, estimateId });
    return "error";
  }
  if (!estimate.client_id) {
    log.error("estimate deposit charge on an estimate with no client", { paymentIntentId: paymentIntent.id, estimateId });
    return "error";
  }

  // Credit the DEPOSIT, not the total charged. When a card processing fee
  // applies the intent is deposit + fee, but the fee is the org's revenue and
  // was never the client's money — crediting the gross would hand them a
  // prepayment worth more than they agreed to put down. Same split as the
  // invoice recorder (balance_cents vs the charged amount).
  //
  // Validated rather than `Number(...) || paymentIntent.amount`: that fallback
  // silently credits the GROSS whenever the metadata is absent, NaN, "" or
  // "0". Bad metadata means we don't know what to credit, so fail loudly and
  // let it be reconciled by hand.
  const depositCents = Number.parseInt(paymentIntent.metadata?.deposit_cents ?? "", 10);
  const feeCents = Number.parseInt(paymentIntent.metadata?.fee_cents ?? "0", 10);
  if (!Number.isFinite(depositCents) || depositCents <= 0 || depositCents > paymentIntent.amount) {
    log.error("estimate deposit intent has unusable deposit_cents metadata", {
      paymentIntentId: paymentIntent.id,
      depositCents: paymentIntent.metadata?.deposit_cents,
      amount: paymentIntent.amount,
    });
    return "error";
  }

  // A deposit already banked for this estimate under a DIFFERENT intent means
  // two charges got through (see the reuse guard in deposit-intent/route.ts).
  // Record nothing: crediting the second would double the client's prepayment
  // against a single agreed deposit. The charge is real, so it is logged for a
  // human to refund rather than silently absorbed.
  if (
    (estimate.deposit_collected_cents ?? 0) > 0 &&
    estimate.deposit_reference &&
    estimate.deposit_reference !== paymentIntent.id
  ) {
    log.error("a second deposit charge succeeded for an estimate that already has one — needs a refund", {
      paymentIntentId: paymentIntent.id,
      estimateId,
      alreadyCollectedCents: estimate.deposit_collected_cents,
      existingReference: estimate.deposit_reference,
    });
    return "error";
  }
  const { method } = await resolveMethod(db, orgId, paymentIntent, connectedAccountId);

  const { data: inserted, error: insertErr } = await db
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: null,
      client_id: estimate.client_id,
      amount_cents: depositCents,
      // Nothing to apply it to yet — the whole deposit is account credit until
      // an invoice exists. This is what keeps
      // allocations + unused + refunded = amount true from the first moment.
      unused_amount_cents: depositCents,
      is_prepayment: true,
      payment_date: todayInZone(await getOrgTimeZone(db, orgId)),
      method,
      reference: paymentIntent.id,
      memo: `Deposit for estimate #${estimate.estimate_number ?? "—"} paid online`,
      processing_fee_cents: feeCents,
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();

  // 23505 means the payment row is already there — this delivery is a Stripe
  // retry or a replay. It is NOT a reason to stop: the insert commits before
  // the estimate stamp and the balance sync, so a previous attempt that died
  // in between (resolveMethod calls Stripe, which is a real window on a cold
  // invocation) would otherwise leave the estimate showing no deposit, the
  // client's balance missing the credit, and — for ACH — deposit_pending_*
  // set forever. Worse, deposit_collected_cents staying 0 lets the proposal
  // take a SECOND deposit. Fall through and re-run the side effects; they are
  // all idempotent writes of the same values.
  const alreadyRecorded = insertErr?.code === "23505";
  if (insertErr && !alreadyRecorded) {
    log.error("failed to insert estimate deposit prepayment", {
      error: insertErr,
      paymentIntentId: paymentIntent.id,
    });
    return "error";
  }

  // Stamp the estimate so the proposal page and the estimate header both stop
  // asking for a deposit, and staff can see how it was taken. Non-fatal: the
  // money is already recorded above, and a failure here must not make the
  // webhook 500 and retry an insert that would then be a no-op anyway.
  const { error: stampErr } = await db
    .from("estimates")
    .update({
      deposit_collected_cents: depositCents,
      deposit_collected_at: new Date().toISOString(),
      deposit_method: paymentIntent.payment_method_types.includes("us_bank_account") ? "ach" : "credit_card",
      deposit_reference: paymentIntent.id,
      // Settled — the pending marker has done its job (it only ever gets set
      // for ACH, which sits in `processing` for days).
      deposit_pending_intent_id: null,
      deposit_pending_cents: null,
      deposit_pending_method: null,
      deposit_pending_at: null,
      // A retry after a bounced debit landed. Clear the failure too, or the
      // estimate shows a collected deposit AND a failed one, and the proposal
      // link stays re-opened for a third attempt.
      deposit_failed_at: null,
      deposit_failed_cents: null,
      deposit_failed_method: null,
      deposit_failed_reason: null,
    })
    .eq("id", estimateId)
    .eq("org_id", orgId);
  if (stampErr) {
    log.error("recorded the deposit but failed to stamp the estimate", {
      error: stampErr,
      paymentIntentId: paymentIntent.id,
      estimateId,
    });
  }

  await db.rpc("sync_client_balance", { p_client_id: estimate.client_id });

  await db.from("client_activity").insert({
    org_id: orgId,
    client_id: estimate.client_id,
    activity_type: "payment",
    subject: `Deposit received: ${method} (online) — credited to account`,
    amount_cents: depositCents,
    ref_id: inserted.id,
    ref_table: "crm_payments",
  });

  return "applied";
}
