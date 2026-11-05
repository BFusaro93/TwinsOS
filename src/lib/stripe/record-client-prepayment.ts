import type Stripe from "stripe";
import { logger } from "@/lib/logger";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { accountOwnedByOrg, resolveMethod, type RecordStripeChargeResult } from "@/lib/stripe/record-charge";

const log = logger.child("stripe client prepayment");

/** Bounds for a customer-entered prepayment. The ceiling is a typo guard, not a business rule. */
export const PORTAL_PREPAYMENT_MIN_CENTS = 100;
export const PORTAL_PREPAYMENT_MAX_CENTS = 2_500_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Records a succeeded portal "Make a Prepayment" charge as an UNAPPLIED
 * PREPAYMENT on the client's account: a crm_payments row with no invoice_id,
 * is_prepayment = true and the whole amount in unused_amount_cents. Same shape
 * as a proposal deposit (recordEstimateDepositCharge), minus the estimate.
 *
 * The Connect webhook is this charge's only writer. Idempotency is the unique
 * index on crm_payments.stripe_payment_intent_id, so a Stripe retry or a replay
 * no-ops (23505 is treated as "already recorded", and the balance sync that
 * follows is itself idempotent).
 */
export async function recordClientPrepaymentCharge({
  db,
  paymentIntent,
  connectedAccountId,
}: {
  db: Db;
  paymentIntent: Stripe.PaymentIntent;
  connectedAccountId: string | null | undefined;
}): Promise<RecordStripeChargeResult> {
  if (paymentIntent.metadata?.source !== "crm_client_prepayment") return "skipped";
  if (paymentIntent.status !== "succeeded") return "skipped";

  const orgId = paymentIntent.metadata?.org_id;
  const clientId = paymentIntent.metadata?.client_id;
  if (!orgId || !clientId || !connectedAccountId) {
    log.error("prepayment intent is missing org_id/client_id/account", { paymentIntentId: paymentIntent.id });
    return "error";
  }
  // Metadata is writable by the connected account's owner, so confirm the
  // account the charge fired on really belongs to that org.
  if (!(await accountOwnedByOrg(db, orgId, connectedAccountId))) {
    log.error("prepayment metadata org_id does not own the connected account", {
      paymentIntentId: paymentIntent.id,
      orgId,
      connectedAccountId,
    });
    return "error";
  }
  const { data: client } = await db
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!client) {
    log.error("prepayment charge names a client that isn't in the org", { paymentIntentId: paymentIntent.id, clientId });
    return "error";
  }

  // Credit the prepayment, not the gross: a card processing fee is the org's
  // revenue and was never the customer's money. Bad metadata means we don't
  // know what to credit, so fail loudly rather than guess the gross.
  const prepaymentCents = Number.parseInt(paymentIntent.metadata?.prepayment_cents ?? "", 10);
  const feeCents = Number.parseInt(paymentIntent.metadata?.fee_cents ?? "0", 10) || 0;
  if (!Number.isFinite(prepaymentCents) || prepaymentCents <= 0 || prepaymentCents > paymentIntent.amount) {
    log.error("prepayment intent has unusable prepayment_cents metadata", {
      paymentIntentId: paymentIntent.id,
      prepaymentCents: paymentIntent.metadata?.prepayment_cents,
      amount: paymentIntent.amount,
    });
    return "error";
  }

  const { method } = await resolveMethod(db, orgId, paymentIntent, connectedAccountId);

  const { data: inserted, error: insertErr } = await db
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: null,
      client_id: clientId,
      amount_cents: prepaymentCents,
      // Nothing to apply it to — the whole amount is account credit, which keeps
      // allocations + unused + refunded = amount true from the first moment.
      unused_amount_cents: prepaymentCents,
      is_prepayment: true,
      payment_date: todayInZone(await getOrgTimeZone(db, orgId)),
      method,
      reference: paymentIntent.id,
      memo: "Prepayment made online through the customer portal",
      processing_fee_cents: feeCents,
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();

  const alreadyRecorded = insertErr?.code === "23505";
  if (insertErr && !alreadyRecorded) {
    log.error("failed to insert portal prepayment", { error: insertErr, paymentIntentId: paymentIntent.id });
    return "error";
  }

  await db.rpc("sync_client_balance", { p_client_id: clientId });

  let paymentId: string | null = (inserted?.id as string | undefined) ?? null;
  if (!paymentId) {
    const { data: existing } = await db
      .from("crm_payments")
      .select("id")
      .eq("org_id", orgId)
      .eq("stripe_payment_intent_id", paymentIntent.id)
      .limit(1)
      .maybeSingle();
    paymentId = (existing?.id as string | undefined) ?? null;
  }
  if (paymentId && !alreadyRecorded) {
    await db.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "payment",
      subject: `Prepayment received: ${method} (online) — credited to account`,
      amount_cents: prepaymentCents,
      ref_id: paymentId,
      ref_table: "crm_payments",
    });
  }

  return alreadyRecorded ? "already_recorded" : "applied";
}
