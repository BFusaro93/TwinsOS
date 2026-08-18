import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPortalContext } from "@/lib/portal/get-portal-context";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";

const CreateIntentSchema = z.object({
  invoiceId: z.string().uuid(),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = CreateIntentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { invoiceId, paymentMethod } = parsed.data;

  const supabase = await createClient();

  const { data: invoice } = await supabase
    .from("crm_invoices")
    .select("id, org_id, client_id, invoice_number, balance_cents")
    .eq("id", invoiceId)
    .eq("client_id", ctx.clientId)
    .eq("org_id", ctx.orgId)
    .is("deleted_at", null)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.balance_cents <= 0) {
    return NextResponse.json({ error: "Invoice has no balance due" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled"
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

  const stripe = getStripe();
  // Direct charge on the org's connected account — see create-intent/route.ts
  // (CRM staff-facing version) for the same pattern.
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
    { stripeAccount: org.stripe_connect_account_id }
  );

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    connectedAccountId: org.stripe_connect_account_id,
    balanceCents: invoice.balance_cents,
    feeCents,
    totalChargeCents,
  });
}
