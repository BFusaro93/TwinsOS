import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";

const CreateIntentSchema = z.object({
  invoiceId: z.string().uuid(),
  waiveFee: z.boolean().optional(),
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
  const { invoiceId, waiveFee } = parsed.data;

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
    .select("cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents")
    .eq("id", profile.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const { feeCents, totalChargeCents } = computeProcessingFee(
    {
      ccProcessingFeeEnabled: org.cc_processing_fee_enabled,
      ccProcessingFeeBps: org.cc_processing_fee_bps,
      ccProcessingFeeThresholdCents: org.cc_processing_fee_threshold_cents,
    },
    invoice.balance_cents,
    waiveFee ?? false
  );

  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalChargeCents,
    currency: "usd",
    payment_method_types: ["card"],
    metadata: {
      source: "crm_invoice",
      org_id: invoice.org_id,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      balance_cents: String(invoice.balance_cents),
      fee_cents: String(feeCents),
    },
  });

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    balanceCents: invoice.balance_cents,
    feeCents,
    totalChargeCents,
  });
}
