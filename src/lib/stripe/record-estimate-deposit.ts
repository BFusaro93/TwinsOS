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
    .select("id, org_id, client_id, estimate_number, deposit_required_cents")
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

  // The charged amount is authoritative — it is what Stripe actually took.
  const depositCents = paymentIntent.amount_received || paymentIntent.amount;
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
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") return "already_recorded";
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
      deposit_method: "credit_card",
      deposit_reference: paymentIntent.id,
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
