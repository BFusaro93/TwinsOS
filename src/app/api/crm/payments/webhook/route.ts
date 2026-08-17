import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { methodForCardBrand } from "@/lib/stripe/crm-payments";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";

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
    console.error("[crm payments webhook] signature verification failed:", err);
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
    console.error("[crm payments webhook] missing/invalid metadata on payment intent", paymentIntent.id);
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

  // `balanceCents` is the balance the intent was created against, captured
  // at create-intent time — if a second PaymentIntent for the same invoice
  // was created before the first settled (e.g. the customer opened the pay
  // link on two devices, or the portal and the public link both created
  // one), both intents can genuinely succeed as real card charges, each
  // quoting the FULL balance owed at creation time. Re-check the invoice's
  // actual remaining balance right before applying this payment and clamp
  // to it, crediting any excess as unused/prepayment credit rather than
  // driving the balance negative or double-counting what's owed. This can't
  // undo a real double charge on the customer's card, but it keeps the
  // ledger honest about what's actually still owed.
  const { data: invoiceBefore, error: invoiceBeforeErr } = await supabase
    .from("crm_invoices")
    .select("total_cents, amount_paid_cents, status")
    .eq("id", invoiceId)
    .single();
  if (invoiceBeforeErr) {
    console.error("[crm payments webhook] failed to load invoice before applying payment:", invoiceBeforeErr);
    return NextResponse.json({ error: "Failed to load invoice" }, { status: 500 });
  }

  const currentBalanceCents = Math.max(0, invoiceBefore.total_cents - invoiceBefore.amount_paid_cents);
  const appliedCents = Math.min(balanceCents, currentBalanceCents);
  const overpaidCents = balanceCents - appliedCents;

  const { data: inserted, error: insertErr } = await supabase
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: invoiceId,
      client_id: clientId,
      amount_cents: balanceCents,
      unused_amount_cents: overpaidCents,
      payment_date: new Date().toISOString().slice(0, 10),
      method: methodForCardBrand(cardBrand),
      memo: overpaidCents > 0
        ? "Paid online via card (exceeds invoice balance — excess credited to account)"
        : "Paid online via card",
      is_prepayment: false,
      processing_fee_cents: feeCents,
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Already processed this PaymentIntent (Stripe retried the webhook delivery) — no-op.
      return NextResponse.json({ received: true });
    }
    console.error("[crm payments webhook] failed to insert crm_payments:", insertErr);
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }

  try {
    const newPaid = invoiceBefore.amount_paid_cents + appliedCents;
    const newBalance = Math.max(0, invoiceBefore.total_cents - newPaid);
    const openStatus = invoiceBefore.status === "printed" ? "printed" : "sent";
    const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : openStatus;
    const wasNewlyPaid = newStatus === "paid" && invoiceBefore.status !== "paid";

    const { error: updateErr } = await supabase
      .from("crm_invoices")
      .update({ amount_paid_cents: newPaid, balance_cents: newBalance, status: newStatus })
      .eq("id", invoiceId);
    if (updateErr) throw updateErr;

    if (wasNewlyPaid) {
      await fireSimpleTrigger(supabase, { orgId, clientId, invoiceId, triggerType: "invoice_paid" });
    }

    if (appliedCents > 0) {
      const { error: allocErr } = await supabase
        .from("crm_payment_allocations")
        .insert({ org_id: orgId, payment_id: inserted.id, invoice_id: invoiceId, amount_cents: appliedCents });
      if (allocErr) throw allocErr;
    }

    await supabase.rpc("sync_client_balance", { p_client_id: clientId });

    await supabase.from("client_activity").insert({
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${methodForCardBrand(cardBrand)} (online)${overpaidCents > 0 ? " — partly credited to account" : ""}`,
      amount_cents: balanceCents,
      ref_id: inserted.id,
      ref_table: "crm_payments",
    });
  } catch (err) {
    console.error(`[crm payments webhook] recorded payment ${inserted.id} but failed to apply it:`, err);
    return NextResponse.json({ error: "Failed to apply payment to invoice" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
