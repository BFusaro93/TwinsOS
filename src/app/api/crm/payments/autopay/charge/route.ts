import { NextResponse } from "next/server";
import { z } from "zod";
import Stripe from "stripe";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { logger } from "@/lib/logger";

const log = logger.child("stripe autopay charge");

const ChargeSchema = z.object({ invoiceId: z.string().uuid() });

// See the duplicate-charge guard below: how far back to look for an
// already-in-flight/succeeded PaymentIntent against the same invoice, and
// which statuses count as "still real money that might land" rather than a
// dead end the staff member is free to retry past.
const RECENT_CHARGE_WINDOW_SECONDS = 120;
const BLOCKING_PAYMENT_INTENT_STATUSES = new Set([
  "succeeded",
  "processing",
  "requires_capture",
  "requires_action",
  "requires_confirmation",
]);

/** Charges an invoice's balance against the client's saved payment method (card or
 * ACH) off-session — the "Invoices to Charge" / "ACH Invoices to Charge" queues use
 * this instead of the customer confirming a PaymentElement themselves. On success the
 * existing Connect webhook (payment_intent.succeeded) applies the payment to the
 * invoice exactly like a customer-initiated charge — the metadata contract matches. */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  // This actually moves the client's money — gate it behind the same
  // permission that gates recording/modifying payments in the Invoices UI
  // (admins always pass — see has_settings_permission()'s own definition).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: canCharge } = await (supabase.rpc as any)("has_settings_permission", {
    p_key: "acct_add_modify_payments",
  });
  if (!canCharge) {
    return NextResponse.json({ error: "You don't have permission to charge payment methods" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = ChargeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { invoiceId } = parsed.data;

  const { data: invoice } = await supabase
    .from("crm_invoices")
    .select("id, org_id, client_id, invoice_number, balance_cents")
    .eq("id", invoiceId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.balance_cents <= 0) {
    return NextResponse.json({ error: "Invoice has no balance due" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id, stripe_customer_id, saved_payment_method_id, saved_payment_method_type")
    .eq("id", invoice.client_id)
    .eq("org_id", profile.org_id)
    .single();
  if (!client?.stripe_customer_id || !client.saved_payment_method_id || !client.saved_payment_method_type) {
    return NextResponse.json({ error: "This client has no saved payment method on file" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled"
    )
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json(
      { error: "Connect your Stripe account in Settings before accepting card payments." },
      { status: 400 }
    );
  }

  const paymentMethod = client.saved_payment_method_type;
  // The processing fee only ever applies to card — ACH is the fee-free alternative by design.
  const { feeCents, totalChargeCents } =
    paymentMethod === "card"
      ? computeProcessingFee(
          {
            ccProcessingFeeEnabled: org.cc_processing_fee_enabled,
            ccProcessingFeeBps: org.cc_processing_fee_bps,
            ccProcessingFeeThresholdCents: org.cc_processing_fee_threshold_cents,
          },
          invoice.balance_cents,
          false
        )
      : { feeCents: 0, totalChargeCents: invoice.balance_cents };

  const stripe = getStripe();

  // chargeIdempotencyKey only collapses attempts within the same 10-second
  // bucket — a double-submit further apart than that (two staff, or one
  // staff in two tabs) would otherwise sail through as two genuinely
  // separate, real charges. Ask Stripe directly whether a PaymentIntent for
  // this exact invoice already exists from the last few minutes and hasn't
  // definitively failed, and refuse to charge again if so.
  try {
    const recentIntents = await stripe.paymentIntents.list(
      {
        customer: client.stripe_customer_id,
        created: { gte: Math.floor(Date.now() / 1000) - RECENT_CHARGE_WINDOW_SECONDS },
        limit: 20,
      },
      { stripeAccount: org.stripe_connect_account_id }
    );
    const duplicate = recentIntents.data.find(
      (pi) => pi.metadata?.invoice_id === invoice.id && BLOCKING_PAYMENT_INTENT_STATUSES.has(pi.status)
    );
    if (duplicate) {
      return NextResponse.json(
        {
          error:
            "A charge was already just submitted for this invoice. Please wait a moment or check Payment History before retrying.",
        },
        { status: 409 }
      );
    }
  } catch (err) {
    // Fail open on the lookup itself (a Stripe API hiccup shouldn't block a
    // legitimate charge) — chargeIdempotencyKey's 10-second window still
    // catches an exact-duplicate retry; this is the belt-and-suspenders
    // layer for a slower double-submit.
    log.error("failed to check for a recent duplicate charge", { error: err, invoiceId });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalChargeCents,
        currency: "usd",
        customer: client.stripe_customer_id,
        payment_method: client.saved_payment_method_id,
        payment_method_types: [paymentMethod],
        off_session: true,
        confirm: true,
        metadata: {
          source: "crm_invoice",
          org_id: invoice.org_id,
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          balance_cents: String(invoice.balance_cents),
          fee_cents: String(feeCents),
        },
      },
      {
        stripeAccount: org.stripe_connect_account_id,
        idempotencyKey: chargeIdempotencyKey(["crm_invoice_autopay", invoice.id, totalChargeCents, paymentMethod]),
      }
    );

    return NextResponse.json({
      status: paymentIntent.status,
      balanceCents: invoice.balance_cents,
      feeCents,
      totalChargeCents,
      clientId: invoice.client_id,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeCardError) {
      return NextResponse.json(
        { error: err.message || "The saved payment method was declined" },
        { status: 402 }
      );
    }
    log.error("autopay charge failed", { error: err, invoiceId });
    return NextResponse.json({ error: "Failed to charge the saved payment method" }, { status: 500 });
  }
}
