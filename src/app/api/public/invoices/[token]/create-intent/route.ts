import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";

// Public, unauthenticated "pay without logging in" endpoint. Mirrors the
// authenticated /api/crm/payments/create-intent exactly — same metadata
// shape — so the existing signed Stripe webhook (which is the only writer
// of crm_payments/crm_invoices) handles it identically regardless of how
// the PaymentIntent was created. This route itself never touches the
// ledger; it only ever creates a PaymentIntent scoped to the one invoice
// the token resolves to.
const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const { token } = await params;
  const supabase = serviceClient();

  const { data: shareToken, error: tokenErr } = await supabase
    .from("invoice_share_tokens")
    .select("invoice_id, org_id, expires_at, revoked_at")
    .eq("token", token)
    .single();
  if (tokenErr || !shareToken) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (shareToken.revoked_at) {
    return NextResponse.json({ error: "This invoice link has been revoked" }, { status: 410 });
  }
  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invoice link has expired" }, { status: 410 });
  }

  const { data: invoice } = await supabase
    .from("crm_invoices")
    .select("id, org_id, client_id, balance_cents, status")
    .eq("id", shareToken.invoice_id)
    .eq("org_id", shareToken.org_id)
    .is("deleted_at", null)
    .single();
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  if (invoice.status === "void") {
    return NextResponse.json({ error: "This invoice has been voided" }, { status: 400 });
  }
  if (invoice.balance_cents <= 0) {
    return NextResponse.json({ error: "Invoice has no balance due" }, { status: 400 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, stripe_connect_account_id, stripe_connect_charges_enabled"
    )
    .eq("id", invoice.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json(
      { error: "This organization hasn't finished setting up card payments yet." },
      { status: 400 }
    );
  }

  const { feeCents, totalChargeCents } = computeProcessingFee(
    {
      ccProcessingFeeEnabled: org.cc_processing_fee_enabled,
      ccProcessingFeeBps: org.cc_processing_fee_bps,
      ccProcessingFeeThresholdCents: org.cc_processing_fee_threshold_cents,
    },
    invoice.balance_cents,
    false
  );

  const stripe = getStripe();
  // Created directly on the org's connected account (a "direct charge") so the
  // funds land in their own Stripe balance/payouts, never the platform's —
  // same as every other crm_invoice payment entry point (see create-intent.ts).
  const paymentIntent = await stripe.paymentIntents.create(
    {
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
    },
    {
      stripeAccount: org.stripe_connect_account_id,
      idempotencyKey: chargeIdempotencyKey(["crm_invoice_public", invoice.id, totalChargeCents]),
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
