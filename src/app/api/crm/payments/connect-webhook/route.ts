import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { methodForPaymentIntent, decodeAllocations } from "@/lib/stripe/crm-payments";
import { statusForAccount } from "@/lib/stripe/connect";
import { summarizePaymentMethod } from "@/lib/stripe/saved-payment-methods";
import { fireSimpleTrigger } from "@/lib/automations/sequence-enrollment";
import { logger } from "@/lib/logger";

const log = logger.child("stripe connect webhook");

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
    log.error("connect webhook received but not configured", {
      hasSecretKey: isStripeConfigured(),
      hasWebhookSecret: Boolean(process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
    });
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const stripe = getStripe();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    log.error("connect webhook missing stripe-signature header");
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
        (failedIntent.metadata?.source === "crm_invoice" || failedIntent.metadata?.source === "crm_invoice_multi") &&
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
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const source = paymentIntent.metadata?.source;
      const result =
        source === "crm_invoice_multi"
          ? await applyCrmInvoiceMultiPayment(stripe, db, supabase, event)
          : await applyCrmInvoicePayment(stripe, db, supabase, event);
      if (result === "error") {
        return NextResponse.json({ error: "Failed to apply payment to invoice" }, { status: 500 });
      }
      break;
    }

    // Fires when a saved card's details change — most commonly Stripe's Account
    // Updater silently refreshing an expiring card's new number/exp date behind
    // the scenes, but also any explicit update. Matched by payment method id
    // rather than customer id since that's the identifier we actually store
    // on the client row (src/app/api/crm/payments/connect/setup-intent/route.ts).
    case "payment_method.updated": {
      const pm = event.data.object as Stripe.PaymentMethod;
      if (!event.account) break;

      const { data: matchedClient } = await db
        .from("clients")
        .select("id, org_id")
        .eq("saved_payment_method_id", pm.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (matchedClient && (await eventAccountOwnedByOrg(db, matchedClient.org_id, event.account))) {
        await db
          .from("clients")
          .update({ saved_payment_method_summary: summarizePaymentMethod(pm) })
          .eq("id", matchedClient.id);
        await fireSimpleTrigger(supabase, {
          orgId: matchedClient.org_id,
          clientId: matchedClient.id,
          triggerType: "credit_card_updated",
        });
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
  const isAch = paymentIntent.payment_method_types.includes("us_bank_account");
  if (!isAch) {
    try {
      const charges = await stripe.charges.list(
        { payment_intent: paymentIntent.id, limit: 1 },
        { stripeAccount: event.account }
      );
      cardBrand = charges.data[0]?.payment_method_details?.card?.brand ?? null;
    } catch {
      cardBrand = null;
    }
  }
  const method = methodForPaymentIntent(paymentIntent.payment_method_types, cardBrand);

  const { data: inserted, error: insertErr } = await db
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: invoiceId,
      client_id: clientId,
      amount_cents: balanceCents,
      unused_amount_cents: 0,
      payment_date: new Date().toISOString().slice(0, 10),
      method,
      memo: isAch ? "Paid online via bank transfer" : "Paid online via card",
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
      org_id: orgId,
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${method} (online)`,
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

/** Applies a succeeded crm_invoice_multi PaymentIntent — one charge split across several
 * invoices for the same client — mirrors applyCrmInvoicePayment above but loops the invoice
 * update + allocation insert per invoice under a single crm_payments row, the same way a
 * manually-recorded multi-invoice payment is split via crm_payment_allocations. */
async function applyCrmInvoiceMultiPayment(
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  event: Stripe.Event
): Promise<"applied" | "skipped" | "error"> {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  if (paymentIntent.metadata?.source !== "crm_invoice_multi") return "skipped";
  if (!event.account) {
    log.error("payment_intent.succeeded with no connected account on event", { paymentIntentId: paymentIntent.id });
    return "error";
  }

  const { org_id: orgId, client_id: clientId, allocations: encodedAllocations } = paymentIntent.metadata;
  const feeCents = parseInt(paymentIntent.metadata.fee_cents, 10);

  if (!orgId || !clientId || !encodedAllocations || !Number.isFinite(feeCents)) {
    log.error("missing/invalid metadata on multi-invoice payment intent", { paymentIntentId: paymentIntent.id });
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

  const allocations = decodeAllocations(encodedAllocations);
  const totalCents = allocations.reduce((sum, a) => sum + a.amountCents, 0);

  let cardBrand: string | null = null;
  const isAch = paymentIntent.payment_method_types.includes("us_bank_account");
  if (!isAch) {
    try {
      const charges = await stripe.charges.list(
        { payment_intent: paymentIntent.id, limit: 1 },
        { stripeAccount: event.account }
      );
      cardBrand = charges.data[0]?.payment_method_details?.card?.brand ?? null;
    } catch {
      cardBrand = null;
    }
  }
  const method = methodForPaymentIntent(paymentIntent.payment_method_types, cardBrand);

  const { data: inserted, error: insertErr } = await db
    .from("crm_payments")
    .insert({
      org_id: orgId,
      invoice_id: allocations.length === 1 ? allocations[0].invoiceId : null,
      client_id: clientId,
      amount_cents: totalCents,
      unused_amount_cents: 0,
      payment_date: new Date().toISOString().slice(0, 10),
      method,
      memo: isAch ? "Paid online via bank transfer" : "Paid online via card",
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
    const newlyPaidInvoiceIds: string[] = [];

    for (const alloc of allocations) {
      // Scoped by client_id as well as org_id/id: metadata.client_id and the encoded
      // allocation list are two independently-editable metadata keys on a PaymentIntent
      // a connected account's own owner can forge — this stops a same-org mismatch
      // between the two from applying one client's charge to another client's invoice.
      const { data: invoice, error: invoiceErr } = await db
        .from("crm_invoices")
        .select("total_cents, amount_paid_cents, status")
        .eq("id", alloc.invoiceId)
        .eq("org_id", orgId)
        .eq("client_id", clientId)
        .single();
      if (invoiceErr) throw invoiceErr;

      const newPaid = Math.max(0, invoice.amount_paid_cents + alloc.amountCents);
      const newBalance = Math.max(0, invoice.total_cents - newPaid);
      const openStatus = invoice.status === "printed" ? "printed" : "sent";
      const newStatus = newBalance <= 0 ? "paid" : newPaid > 0 ? "partial" : openStatus;
      const wasNewlyPaid = newStatus === "paid" && invoice.status !== "paid";

      const { error: updateErr } = await db
        .from("crm_invoices")
        .update({ amount_paid_cents: newPaid, balance_cents: newBalance, status: newStatus })
        .eq("id", alloc.invoiceId)
        .eq("org_id", orgId)
        .eq("client_id", clientId);
      if (updateErr) throw updateErr;

      if (wasNewlyPaid) newlyPaidInvoiceIds.push(alloc.invoiceId);

      const { error: allocErr } = await db
        .from("crm_payment_allocations")
        .insert({ org_id: orgId, payment_id: inserted.id, invoice_id: alloc.invoiceId, amount_cents: alloc.amountCents });
      if (allocErr) throw allocErr;
    }

    for (const invoiceId of newlyPaidInvoiceIds) {
      await fireSimpleTrigger(supabase, { orgId, clientId, invoiceId, triggerType: "invoice_paid" });
    }

    await db.rpc("sync_client_balance", { p_client_id: clientId });

    await db.from("client_activity").insert({
      org_id: orgId,
      client_id: clientId,
      activity_type: "payment",
      subject: `Payment received: ${method} (online) — ${allocations.length} invoices`,
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
