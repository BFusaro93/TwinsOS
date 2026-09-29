import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { methodForCardBrand } from "@/lib/stripe/crm-payments";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { logger } from "@/lib/logger";
import { getOrgTimeZone } from "@/lib/time/org-timezone";
import { todayInZone } from "@/lib/time/zone";

const log = logger.child("crm payments webhook");

// Handles payment_intent events for PaymentIntents created on the PLATFORM
// account. Since Stripe Connect onboarding, new crm_invoice PaymentIntents are
// created directly on the org's connected account instead (a "direct charge"),
// so their events arrive at connect-webhook/route.ts, not here. This endpoint
// stays live only to finish processing any pre-Connect PaymentIntents still in flight.
export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_CRM_PAYMENTS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_CRM_PAYMENTS_WEBHOOK_SECRET);
  } catch (err) {
    log.error("signature verification failed", { error: err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "payment_intent.payment_failed") {
    const failedIntent = event.data.object as Stripe.PaymentIntent;
    const { org_id: failedOrgId, client_id: failedClientId } = failedIntent.metadata ?? {};
    if (failedIntent.metadata?.source === "crm_invoice" && failedOrgId && failedClientId) {
      const supabase = createServiceClient();
      await fireSimpleTrigger(supabase, {
        orgId: failedOrgId,
        clientId: failedClientId,
        triggerType: "credit_card_charge_failed",
      });
    }
    return NextResponse.json({ received: true });
  }

  if (event.type !== "payment_intent.succeeded") {
    return NextResponse.json({ received: true });
  }

  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (paymentIntent.metadata?.source !== "crm_invoice") {
    return NextResponse.json({ received: true });
  }

  const { org_id: orgId, invoice_id: invoiceId, client_id: clientId } = paymentIntent.metadata;
  const balanceCents = parseInt(paymentIntent.metadata.balance_cents, 10);
  const feeCents = parseInt(paymentIntent.metadata.fee_cents, 10);

  if (!orgId || !invoiceId || !clientId || !Number.isFinite(balanceCents) || !Number.isFinite(feeCents)) {
    log.error("missing/invalid metadata on payment intent", { paymentIntentId: paymentIntent.id });
    return NextResponse.json({ error: "Invalid payment intent metadata" }, { status: 400 });
  }

  const supabase = createServiceClient();

  let cardBrand: string | null = null;
  try {
    const charges = await stripe.charges.list({ payment_intent: paymentIntent.id, limit: 1 });
    cardBrand = charges.data[0]?.payment_method_details?.card?.brand ?? null;
  } catch {
    cardBrand = null;
  }
  const method = methodForCardBrand(cardBrand);

  // The ledger write is ONE transaction in record_stripe_invoice_payment()
  // (20260927100100) — the same RPC src/lib/stripe/record-charge.ts uses for
  // Connect charges. It clamps to the invoice's live balance under a row lock
  // (a second intent for the same invoice credits its excess to the client),
  // refuses draft/void/deleted invoices, and is idempotent on the
  // PaymentIntent id, so a Stripe retry is a no-op and a failure writes
  // nothing. recordStripeCharge() itself can't be called here: it requires
  // the connected account the charge fired on, and these are PLATFORM
  // intents (created with our own key, so their metadata is trusted).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db.rpc("record_stripe_invoice_payment", {
    p_org_id: orgId,
    p_client_id: clientId,
    p_payment_intent_id: paymentIntent.id,
    p_allocations: [{ invoice_id: invoiceId, amount_cents: balanceCents }],
    p_fee_cents: feeCents,
    p_method: method,
    p_payment_date: todayInZone(await getOrgTimeZone(supabase, orgId)),
    p_channel_label: "card",
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ received: true });
    log.error("failed to record stripe payment", { error, paymentIntentId: paymentIntent.id });
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    result: string;
    payment_id: string;
    amount_cents: number | null;
    unused_cents: number | null;
    newly_paid_invoice_ids: string[] | null;
  } | null;
  if (!row) {
    log.error("record_stripe_invoice_payment returned no row", { paymentIntentId: paymentIntent.id });
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }
  if (row.result === "already_recorded") return NextResponse.json({ received: true });

  // Best-effort follow-up: the money is recorded, so nothing below may 500
  // (Stripe would retry a no-op forever).
  try {
    for (const paidInvoiceId of row.newly_paid_invoice_ids ?? []) {
      await fireSimpleTrigger(supabase, { orgId, clientId, invoiceId: paidInvoiceId, triggerType: "invoice_paid" });
    }
    const unusedCents = row.unused_cents ?? 0;
    await db.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${method} (online)${unusedCents > 0 ? " — partly credited to account" : ""}`,
      amount_cents: row.amount_cents ?? balanceCents,
      ref_id: row.payment_id,
      ref_table: "crm_payments",
    });
  } catch (err) {
    log.error("recorded payment but a follow-up step failed", { error: err, paymentId: row.payment_id });
  }

  return NextResponse.json({ received: true });
}
