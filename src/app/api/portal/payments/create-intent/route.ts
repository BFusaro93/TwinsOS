import { NextResponse } from "next/server";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { logger } from "@/lib/logger";
import { applyCreditBeforeCharge } from "@/lib/stripe/apply-credit-first";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { refuseIfChargeInFlight, ensureIntentCustomer } from "@/lib/stripe/duplicate-charge";

const log = logger.child("portal create-intent");

// Stripe rejects charges under 50 cents.
const STRIPE_MIN_CHARGE_CENTS = 50;

const CreateIntentSchema = z.object({
  invoiceId: z.string().uuid(),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

export async function POST(request: Request) {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fails open if the limiter errors. Keyed per portal client.
  if (!(await checkAuthRateLimit(`portal-pay-intent:${ctx.clientId}`, 20, 600))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const body = await request.json();
  const parsed = CreateIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { invoiceId, paymentMethod } = parsed.data;

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("crm_invoices")
    .select("id, org_id, client_id, invoice_number, balance_cents, status")
    .eq("id", invoiceId)
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    // A draft isn't visible in the portal, so it can't be paid from it either.
    .neq("status", "draft")
    .is("deleted_at", null)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "void") {
    return NextResponse.json({ error: "This invoice has been voided" }, { status: 400 });
  }
  if (invoice.balance_cents <= 0) {
    return NextResponse.json({ error: "Invoice has no balance due" }, { status: 400 });
  }
  // Settle with any credit/deposit already on the account first so the card
  // only pays what is still owed. Service role: portal customers have no
  // profile, so the user-session RPC guard would reject them.
  try {
    invoice.balance_cents = await applyCreditBeforeCharge(createServiceClient(), invoice);
  } catch {
    return NextResponse.json({ error: "We couldn't apply your account credit. Please try again or contact us." }, { status: 500 });
  }
  if (invoice.balance_cents <= 0) {
    return NextResponse.json({ error: "Your account credit has paid this invoice in full — no card payment needed. Refresh to see it." }, { status: 409 });
  }

  // stripe_connect_livemode isn't in the generated Supabase types yet (added
  // by a migration this session wrote but did not apply/regenerate types for).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase.from("organizations") as any)
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled, ach_payments_enabled, stripe_connect_livemode"
    )
    .eq("id", ctx.orgId)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json({ error: "Online payments aren't available yet." }, { status: 400 });
  }

  // The processing fee only ever applies to card — ACH is the fee-free
  // alternative by design, so it must never be computed for that path.
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

  if (totalChargeCents < STRIPE_MIN_CHARGE_CENTS) {
    return NextResponse.json(
      { error: "The remaining balance is below the $0.50 minimum for online payments. Please contact us to settle it." },
      { status: 400 }
    );
  }

  const stripe = getStripeForOrg(org.stripe_connect_livemode);

  try {
  if (paymentMethod === "us_bank_account") {
    if (!org.ach_payments_enabled || !(await achEnabledForAccount(stripe, org.stripe_connect_account_id))) {
      return NextResponse.json({ error: "Bank transfer isn't available yet — please pay by card." }, { status: 400 });
    }
  }

  // Always carry the client's Stripe customer (so the duplicate lookup can
  // see this intent), and refuse while a payment for this invoice is still in
  // flight — a bank debit takes days to settle and the balance doesn't move
  // until it does.
  const service = createServiceClient();
  const customerId = await ensureIntentCustomer({
    stripe,
    connectedAccountId: org.stripe_connect_account_id,
    serviceDb: service,
    orgId: invoice.org_id,
    clientId: invoice.client_id,
  });
  const refusal = await refuseIfChargeInFlight({
    stripe,
    connectedAccountId: org.stripe_connect_account_id,
    db: service,
    invoiceIds: [invoice.id],
    customerId,
    isAch: paymentMethod === "us_bank_account",
  });
  if (refusal) return NextResponse.json({ error: refusal.body.error, code: refusal.body.code }, { status: refusal.status });

  // Direct charge on the org's connected account — see create-intent/route.ts
  // (CRM staff-facing version) for the same pattern.
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: totalChargeCents,
      currency: "usd",
      payment_method_types: [paymentMethod],
      ...(customerId ? { customer: customerId } : {}),
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
      idempotencyKey: chargeIdempotencyKey(["crm_invoice_portal", invoice.id, totalChargeCents, paymentMethod]),
    }
  );

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    connectedAccountId: org.stripe_connect_account_id,
    livemode: org.stripe_connect_livemode ?? true,
    balanceCents: invoice.balance_cents,
    feeCents,
    totalChargeCents,
  });
  } catch (err) {
    return stripeErrorResponse(err, log, { invoiceId: invoice.id, connectedAccountId: org.stripe_connect_account_id });
  }
}
