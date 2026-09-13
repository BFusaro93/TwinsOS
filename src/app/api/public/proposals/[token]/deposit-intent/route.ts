import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";

const BodySchema = z.object({
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
});

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
 * Card or ACH. An ACH debit settles days later, so acceptance is NOT held up
 * waiting for it — the proposal is accepted as soon as the debit is submitted,
 * and the estimate carries a "deposit pending" marker until Stripe confirms
 * settlement (see payment_intent.processing in the Connect webhook). The
 * deposit step also keeps its manual methods and its Skip button for anyone
 * who would rather send a cheque.
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
  const parsed = BodySchema.safeParse(await _req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }
  const { paymentMethod } = parsed.data;
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
    .select(
      "stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_livemode, ach_payments_enabled, cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents"
    )
    .eq("id", estimate.org_id)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json(
      { error: "This organization hasn't finished setting up card payments yet." },
      { status: 400 }
    );
  }

  const stripe = getStripeForOrg(org.stripe_connect_livemode);

  if (paymentMethod === "us_bank_account") {
    if (!org.ach_payments_enabled || !(await achEnabledForAccount(stripe, org.stripe_connect_account_id))) {
      return NextResponse.json(
        { error: "Bank transfer isn't available yet — please pay by card." },
        { status: 400 }
      );
    }
  }

  // The card processing fee applies here on exactly the same terms as an
  // invoice payment: only on card, only when the org has it enabled, and only
  // above the configured threshold (computeProcessingFee). ACH stays fee-free
  // by design — that's the whole point of offering it.
  //
  // The client sees the split before confirming, so "$2,000 deposit + $58.00
  // card fee = $2,058.00" is stated rather than a surprise against the "$2,000
  // due to confirm your project" on the proposal.
  const { feeCents, totalChargeCents } =
    paymentMethod === "card"
      ? computeProcessingFee(
          {
            ccProcessingFeeEnabled: org.cc_processing_fee_enabled,
            ccProcessingFeeBps: org.cc_processing_fee_bps,
            ccProcessingFeeThresholdCents: org.cc_processing_fee_threshold_cents,
          },
          depositCents,
          false
        )
      : { feeCents: 0, totalChargeCents: depositCents };

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: totalChargeCents,
      currency: "usd",
      payment_method_types: [paymentMethod],
      metadata: {
        source: "crm_estimate_deposit",
        org_id: estimate.org_id,
        estimate_id: estimate.id,
        client_id: estimate.client_id,
        // The DEPOSIT, excluding any fee — this is what gets credited to the
        // client. The fee is the org's revenue, not the client's money, and is
        // recorded separately on the payment (same split as crm_invoice).
        deposit_cents: String(depositCents),
        fee_cents: String(feeCents),
      },
    },
    {
      stripeAccount: org.stripe_connect_account_id,
      // Keyed on the method too: card and ACH are genuinely different intents
      // for the same deposit, and a client who starts one and switches must
      // not be handed back the other.
      idempotencyKey: chargeIdempotencyKey([
        "crm_estimate_deposit",
        estimate.id,
        totalChargeCents,
        paymentMethod,
      ]),
    }
  );

  return NextResponse.json({
    clientSecret: paymentIntent.client_secret,
    connectedAccountId: org.stripe_connect_account_id,
    livemode: org.stripe_connect_livemode ?? true,
    depositCents,
    feeCents,
    totalChargeCents,
    paymentMethod,
  });
}
