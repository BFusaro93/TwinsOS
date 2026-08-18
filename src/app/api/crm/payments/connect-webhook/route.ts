import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { methodForCardBrand } from "@/lib/stripe/crm-payments";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { logger } from "@/lib/logger";

const log = logger.child("stripe connect webhook");

/** Stripe's own statuses for a connected account (there's no `status` field on the
 * Account object) — derived from the requirements/capabilities. */
function statusForAccount(account: Stripe.Account): "active" | "restricted" | "pending" {
  if (account.requirements?.disabled_reason) return "restricted";
  if (account.charges_enabled && account.payouts_enabled) return "active";
  return "pending";
}

/** A Standard connected account is a full, independent Stripe account — its
 * owner can call the Stripe API directly and create a PaymentIntent with
 * ARBITRARY metadata (including another org's org_id/invoice_id). Never trust
 * PaymentIntent.metadata.org_id on its own: confirm the account the event
 * actually fired on (event.account) is the one on file for that org first. */
async function eventAccountOwnedByOrg(
  // any: the generated Supabase types don't yet cover every table this webhook touches
  // (crm_payment_allocations, client_activity, stripe_webhook_events) — same pattern as
  // the pre-existing billing/crm-payments webhooks this one supersedes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  orgId: string,
  eventAccount: string
): Promise<boolean> {
  const { data } = await db
    .from("organizations")
    .select("stripe_connect_account_id")
    .eq("id", orgId)
    .single();
  return data?.stripe_connect_account_id === eventAccount;
}

export async function POST(request: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
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
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    log.error("signature verification failed", { error: err });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // ── Idempotency: same dedup table the billing webhook uses. subscription_id
  // stays null here — these events aren't tied to a subscription. ───────────
  const { error: dedupeErr } = await db.from("stripe_webhook_events").insert({
    event_id: event.id,
    event_type: event.type,
    subscription_id: null,
    event_created: new Date(event.created * 1000).toISOString(),
  });
  if (dedupeErr) {
    if (dedupeErr.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    log.error("failed to record event id", { error: dedupeErr, eventId: event.id });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  switch (event.type) {
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      try {
        const { error } = await db
          .from("organizations")
          .update({
            stripe_connect_status: statusForAccount(account),
            stripe_connect_charges_enabled: account.charges_enabled,
            stripe_connect_payouts_enabled: account.payouts_enabled,
          })
          .eq("stripe_connect_account_id", account.id);
        if (error) throw error;
      } catch (err) {
        log.error("failed to apply account.updated", { error: err, accountId: account.id });
        return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
      }
      break;
    }

    case "payment_intent.payment_failed": {
      const failedIntent = event.data.object as Stripe.PaymentIntent;
      const { org_id: failedOrgId, client_id: failedClientId } = failedIntent.metadata ?? {};
      if (
        failedIntent.metadata?.source === "crm_invoice" &&
        failedOrgId &&
        failedClientId &&
        event.account &&
        (await eventAccountOwnedByOrg(db, failedOrgId, event.account))
      ) {
        await fireSimpleTrigger(supabase, {
          orgId: failedOrgId,
          clientId: failedClientId,
          triggerType: "credit_card_charge_failed",
        });
      }
      break;
    }

    case "payment_intent.succeeded": {
      const result = await applyCrmInvoicePayment(stripe, db, supabase, event);
      if (result === "error") {
        return NextResponse.json({ error: "Failed to apply payment to invoice" }, { status: 500 });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}

/** Applies a succeeded crm_invoice PaymentIntent (from a connected account) to its invoice.
 * Mirrors the platform-account version this superseded in src/app/api/crm/payments/webhook/route.ts. */
async function applyCrmInvoicePayment(
  stripe: Stripe,
  // any: the generated Supabase types don't yet cover every table this webhook touches
  // (crm_payment_allocations, client_activity, stripe_webhook_events) — same pattern as
  // the pre-existing billing/crm-payments webhooks this one supersedes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  event: Stripe.Event
): Promise<"applied" | "skipped" | "error"> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (paymentIntent.metadata?.source !== "crm_invoice") return "skipped";
  if (!event.account) {
    log.error("payment_intent.succeeded with no connected account on event", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  const { org_id: orgId, invoice_id: invoiceId, client_id: clientId } = paymentIntent.metadata;
  const balanceCents = parseInt(paymentIntent.metadata.balance_cents, 10);
  const feeCents = parseInt(paymentIntent.metadata.fee_cents, 10);

  if (!orgId || !invoiceId || !clientId || !Number.isFinite(balanceCents) || !Number.isFinite(feeCents)) {
    log.error("missing/invalid metadata on payment intent", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  if (!(await eventAccountOwnedByOrg(db, orgId, event.account))) {
    log.error("payment intent metadata org_id does not own the connected account the event fired on", {
      paymentIntentId: paymentIntent.id,
      orgId,
      eventAccount: event.account,
    });
    return "error";
  }

  let cardBrand: string | null = null;
  try {
    const charges = await stripe.charges.list(
      { payment_intent: paymentIntent.id, limit: 1 },
      { stripeAccount: event.account }
    );
    cardBrand = charges.data[0]?.payment_method_details?.card?.brand ?? null;
  } catch {
    cardBrand = null;
  }

  const { data: inserted, error: insertErr } = await db
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: invoiceId,
      client_id: clientId,
      amount_cents: balanceCents,
      unused_amount_cents: 0,
      payment_date: new Date().toISOString().slice(0, 10),
      method: methodForCardBrand(cardBrand),
      memo: "Paid online via card",
      is_prepayment: false,
      processing_fee_cents: feeCents,
      stripe_payment_intent_id: paymentIntent.id,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Already processed this PaymentIntent (Stripe retried the webhook delivery) — no-op.
      return "skipped";
    }
    log.error("failed to insert crm_payments", { error: insertErr, paymentIntentId: paymentIntent.id });
    return "error";
  }

  try {
    const { data: invoice, error: invoiceErr } = await db
      .from("crm_invoices")
      .select("total_cents, amount_paid_cents, status")
      .eq("id", invoiceId)
      .eq("org_id", orgId)
      .single();
    if (invoiceErr) throw invoiceErr;

    const newPaid = Math.max(0, invoice.amount_paid_cents + balanceCents);
    const newBalance = Math.max(0, invoice.total_cents - newPaid);
    const openStatus = invoice.status === "printed" ? "printed" : "sent";
    const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : openStatus;
    const wasNewlyPaid = newStatus === "paid" && invoice.status !== "paid";

    const { error: updateErr } = await db
      .from("crm_invoices")
      .update({ amount_paid_cents: newPaid, balance_cents: newBalance, status: newStatus })
      .eq("id", invoiceId)
      .eq("org_id", orgId);
    if (updateErr) throw updateErr;

    if (wasNewlyPaid) {
      await fireSimpleTrigger(supabase, { orgId, clientId, invoiceId, triggerType: "invoice_paid" });
    }

    const { error: allocErr } = await db
      .from("crm_payment_allocations")
      .insert({ org_id: orgId, payment_id: inserted.id, invoice_id: invoiceId, amount_cents: balanceCents });
    if (allocErr) throw allocErr;

    await db.rpc("sync_client_balance", { p_client_id: clientId });

    await db.from("client_activity").insert({
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${methodForCardBrand(cardBrand)} (online)`,
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
