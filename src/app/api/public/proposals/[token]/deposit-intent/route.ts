import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";

/**
 * Public, unauthenticated "pay the deposit on this proposal" endpoint.
 *
 * Mirrors /api/public/invoices/[token]/create-intent: it creates a direct
 * charge on the org's own connected account and touches no ledger itself. The
 * signed Connect webhook is the only writer — see recordEstimateDepositCharge
 * in src/lib/stripe/record-estimate-deposit.ts — so the deposit is recorded
 * exactly once whether or not the client's browser survives the redirect back.
 *
 * The amount is ALWAYS taken from estimates.deposit_required_cents. It is
 * never read from the request body: this endpoint is reachable by anyone
 * holding the proposal link.
 *
 * Card only, deliberately. An ACH debit settles days later, which defeats the
 * point of a deposit that confirms the project — and the deposit step keeps
 * its manual methods and its Skip button for anyone who would rather send a
 * cheque.
 */
const serviceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const { token } = await params;
  const supabase = serviceClient();

  const { data: shareToken, error: tokenErr } = await supabase
    .from("estimate_share_tokens")
    .select("estimate_id, org_id, accepted_at, expires_at, deleted_at")
    .eq("token", token)
    .is("deleted_at", null)
    .single();
  if (tokenErr || !shareToken) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }
  if (shareToken.accepted_at) {
    return NextResponse.json({ error: "This proposal has already been accepted" }, { status: 409 });
  }
  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    return NextResponse.json({ error: "Proposal link has expired" }, { status: 410 });
  }

  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, org_id, client_id, estimate_number, stage, deposit_required_cents, deposit_collected_cents, total_cents")
    .eq("id", shareToken.estimate_id)
    .eq("org_id", shareToken.org_id)
    .is("deleted_at", null)
    .single();
  if (!estimate) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });

  // Same gate the accept route applies — a proposal staff have moved on
  // (declined, invoiced, re-tiered) must not still be collectable.
  if (estimate.stage !== "sent") {
    return NextResponse.json({ error: "This proposal is no longer actionable" }, { status: 409 });
  }

  const depositCents = estimate.deposit_required_cents ?? 0;
  if (depositCents <= 0) {
    return NextResponse.json({ error: "This proposal has no deposit due" }, { status: 400 });
  }
  if ((estimate.deposit_collected_cents ?? 0) > 0) {
    return NextResponse.json({ error: "A deposit has already been recorded for this proposal" }, { status: 409 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_livemode")
    .eq("id", estimate.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json(
      { error: "This organization hasn't finished setting up card payments yet." },
      { status: 400 }
    );
  }

  // No processing fee on a deposit. The invoice paths add one because the
  // client is settling a stated balance; a deposit is a round number quoted on
  // the proposal ("$2,000 due to confirm your project") and charging $2,058
  // against it would not match the document they just signed.
  const stripe = getStripeForOrg(org.stripe_connect_livemode);
  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: depositCents,
      currency: "usd",
      payment_method_types: ["card"],
      metadata: {
        source: "crm_estimate_deposit",
        org_id: estimate.org_id,
        estimate_id: estimate.id,
        client_id: estimate.client_id,
        deposit_cents: String(depositCents),
      },
    },
    {
      stripeAccount: org.stripe_connect_account_id,
      idempotencyKey: chargeIdempotencyKey(["crm_estimate_deposit", estimate.id, depositCents]),
    }
  );

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    connectedAccountId: org.stripe_connect_account_id,
    livemode: org.stripe_connect_livemode ?? true,
    depositCents,
  });
}
