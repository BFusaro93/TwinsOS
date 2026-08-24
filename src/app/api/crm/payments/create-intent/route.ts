import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";

const CreateIntentSchema = z.object({
  invoiceId: z.string().uuid(),
  waiveFee: z.boolean().optional(),
  overrideFeeCents: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
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
    .select("id, org_id, client_id, invoice_number, balance_cents")
    .eq("id", invoiceId)
    .eq("org_id", profile.org_id)
    .is("deleted_at", null)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.balance_cents <= 0) {
    return NextResponse.json({ error: "Invoice has no balance due" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled, ach_payments_enabled"
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

  const stripe = getStripe();

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

  // Created directly on the org's connected account (a "direct charge") so the
  // funds land in their own Stripe balance/payouts, never the platform's.
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: totalChargeCents,
      currency: "usd",
      payment_method_types: [paymentMethod],
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
    balanceCents: invoice.balance_cents,
    feeCents,
    totalChargeCents,
  });
}
