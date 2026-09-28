import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { refuseIfChargeInFlight, ensureIntentCustomer } from "@/lib/stripe/duplicate-charge";
import { logger } from "@/lib/logger";

const log = logger.child("stripe create intent");

const CreateIntentSchema = z.object({
  invoiceId: z.string().uuid(),
  waiveFee: z.boolean().optional(),
  overrideFeeCents: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

export async function POST(request: Request) {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  const body = await request.json();
  const parsed = CreateIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { invoiceId, waiveFee, overrideFeeCents, paymentMethod } = parsed.data;

  const { data: invoice } = await supabase
    .from("crm_invoices")
    .select("id, org_id, client_id, invoice_number, balance_cents, status")
    .eq("id", invoiceId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  // Same rule as the allocation guard: money only lands on issued invoices.
  // A charge against a draft/void one could never be applied — it would
  // silently turn into client credit instead of paying the invoice.
  if (invoice.status === "draft" || invoice.status === "void") {
    return NextResponse.json(
      { error: invoice.status === "void" ? "This invoice has been voided" : "Issue this invoice before taking payment on it" },
      { status: 400 }
    );
  }
  if (invoice.balance_cents <= 0) {
    return NextResponse.json({ error: "Invoice has no balance due" }, { status: 400 });
  }

  // stripe_connect_livemode isn't in the generated Supabase types yet (added
  // by a migration this session wrote but did not apply/regenerate types for).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (supabase.from("organizations") as any)
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled, ach_payments_enabled, stripe_connect_livemode"
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
          waiveFee ?? false,
          overrideFeeCents
        )
      : { feeCents: 0, totalChargeCents: invoice.balance_cents };

  const stripe = getStripeForOrg(org.stripe_connect_livemode);

  try {
  if (paymentMethod === "us_bank_account") {
    if (!org.ach_payments_enabled) {
      return NextResponse.json({ error: "ACH payments aren't enabled — turn them on in Settings first." }, { status: 400 });
    }
    if (!(await achEnabledForAccount(stripe, org.stripe_connect_account_id))) {
      return NextResponse.json(
        { error: "ACH isn't enabled on this Stripe account yet — enable US bank account payments under Payment methods in the Stripe dashboard first." },
        { status: 400 }
      );
    }
  }

  // Carry the client's Stripe customer so the duplicate lookup can see this
  // intent, and refuse while a payment for this invoice is still in flight.
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
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });

  // Created directly on the org's connected account (a "direct charge") so the
  // funds land in their own Stripe balance/payouts, never the platform's.
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
      idempotencyKey: chargeIdempotencyKey(["crm_invoice", invoice.id, totalChargeCents, paymentMethod]),
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
    return stripeErrorResponse(err, log, { invoiceId, connectedAccountId: org.stripe_connect_account_id });
  }
}
