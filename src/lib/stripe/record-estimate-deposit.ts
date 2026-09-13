import type Stripe from "stripe";
import { isoNy } from "@/lib/reports/ny-date";
import { logger } from "@/lib/logger";
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
      payment_date: isoNy(new Date()),
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
