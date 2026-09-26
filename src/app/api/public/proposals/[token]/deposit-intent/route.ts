import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { isEstimatePastValidUntil } from "@/lib/estimates/validity";
import { isChangedSinceSent } from "@/lib/estimates/proposal-content";

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
  if (shareToken.expires_at && new Date(shareToken.expires_at) < new Date()) {
    return NextResponse.json({ error: "Proposal link has expired" }, { status: 410 });
  }

  const { data: estimate } = await supabase
    .from("estimates")
    .select("id, org_id, client_id, estimate_number, stage, deposit_required_cents, deposit_collected_cents, total_cents, deposit_pending_intent_id, deposit_pending_method, deposit_failed_at")
    .eq("id", shareToken.estimate_id)
    .eq("org_id", shareToken.org_id)
    .is("deleted_at", null)
    .single();
  if (!estimate) return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  // An unaccepted proposal past its Valid until date can't take a deposit any
  // more than it can be accepted. (A bounced deposit on an already-accepted
  // proposal is a retry, not a new acceptance, so it isn't blocked here.)
  if (!shareToken.accepted_at && estimate.stage === "sent") {
    const { data: vu } = await supabase.from("estimates").select("valid_until_date").eq("id", estimate.id).single();
    if (await isEstimatePastValidUntil(supabase, shareToken.org_id, vu?.valid_until_date)) {
      return NextResponse.json({ error: "This proposal has expired" }, { status: 410 });
    }
  }
  // A deposit starts an acceptance — same rule: only for the version the
  // client's link shows (retries on an already-accepted proposal excepted).
  if (!shareToken.accepted_at && estimate.stage === "sent" && await isChangedSinceSent(supabase, estimate.id)) {
    return NextResponse.json(
      { error: "This proposal was updated after it was sent to you. We'll send you the latest version shortly." },
      { status: 409 }
    );
  }

  // ── Who may still pay a deposit through this link ────────────────────────
  //
  // Normally: an unaccepted proposal still in `sent`.
  //
  // The exception is a RETRY. An ACH debit is authorized at acceptance and can
  // be returned by the bank days later, at which point accepted_at is set and
  // the stage has moved on — so both of the ordinary gates refuse, and the
  // client who genuinely owes a deposit has no way to pay it. That left the
  // office chasing a deposit the client could not give them.
  //
  // So a link re-opens for exactly one narrow case: the last attempt failed
  // (deposit_failed_at) and nothing has been collected since. The amount is
  // still read from the estimate, never the request, so re-opening grants no
  // new power — only another attempt at the same number. The webhook clears
  // deposit_failed_at the moment a deposit lands, which closes the link again.
  const isRetry = !!estimate.deposit_failed_at && (estimate.deposit_collected_cents ?? 0) === 0;

  if (!isRetry) {
    if (shareToken.accepted_at) {
      return NextResponse.json({ error: "This proposal has already been accepted" }, { status: 409 });
    }
    // Same gate the accept route applies — a proposal staff have moved on
    // (declined, invoiced, re-tiered) must not still be collectable.
    if (estimate.stage !== "sent") {
      return NextResponse.json({ error: "This proposal is no longer actionable" }, { status: 409 });
    }
  } else if (estimate.stage === "lost") {
    // A retry is not a way back into a proposal the office has since killed.
    // 'lost' is the only terminal stage — declining a proposal sets it, and
    // 'invoiced' still legitimately wants its deposit paid.
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

  // ── Reuse a deposit intent that is already outstanding ────────────────────
  //
  // chargeIdempotencyKey only buckets by a 10-second window, which is fine for
  // a double-clicked button but useless for a human-paced, unauthenticated
  // flow. Neither of this route's other guards closes the gap either:
  // deposit_collected_cents is written by the webhook AFTER the charge
  // succeeds, and accepted_at AFTER the acceptance POST — so for the whole
  // time the client is typing their card details, both still say "no deposit".
  //
  // Two tabs (or a forwarded link, or a reload after a failed acceptance) would
  // therefore mint two distinct PaymentIntents, both confirmable. The unique
  // index on crm_payments.stripe_payment_intent_id can't collapse them — the
  // ids differ — so the client is charged twice AND credited twice. The invoice
  // path survives this because recordStripeCharge re-reads the balance and
  // clamps; a deposit has no balance to clamp against.
  //
  // So the outstanding intent is remembered on the estimate and handed back
  // instead of creating a second one. Stripe charges a given PaymentIntent at
  // most once, which makes the whole flow genuinely idempotent.
  if (estimate.deposit_pending_intent_id) {
    try {
      const existing = await stripe.paymentIntents.retrieve(
        estimate.deposit_pending_intent_id,
        {},
        { stripeAccount: org.stripe_connect_account_id }
      );
      if (existing.status === "succeeded" || existing.status === "processing") {
        return NextResponse.json(
          { error: "A deposit for this proposal has already been submitted." },
          { status: 409 }
        );
      }
      const reusable =
        existing.status === "requires_payment_method" ||
        existing.status === "requires_confirmation" ||
        existing.status === "requires_action";
      if (reusable && existing.payment_method_types.includes(paymentMethod)) {
        return NextResponse.json({
          clientSecret: existing.client_secret,
          connectedAccountId: org.stripe_connect_account_id,
          livemode: org.stripe_connect_livemode ?? true,
          depositCents,
          feeCents: Number(existing.metadata?.fee_cents) || 0,
          totalChargeCents: existing.amount,
          paymentMethod,
          reused: true,
        });
      }
      // Still open but for the other method — the client switched from card to
      // bank transfer or back. Cancel it so it can never be confirmed later,
      // then fall through and create the one they actually want.
      if (reusable) {
        await stripe.paymentIntents.cancel(
          existing.id,
          {},
          { stripeAccount: org.stripe_connect_account_id }
        );
      }
    } catch {
      // The stored intent is unreadable (wrong mode, deleted, wrong account).
      // Fall through and create a fresh one rather than dead-ending the client.
    }
  }

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

  // Remember it BEFORE handing back the client secret, so a second request can
  // find it even if the client confirms immediately. Best-effort: failing to
  // record it must not deny a client who is trying to pay — it only degrades
  // to the previous (duplicate-prone) behaviour.
  await supabase
    .from("estimates")
    .update({
      deposit_pending_intent_id: paymentIntent.id,
      deposit_pending_cents: depositCents,
      deposit_pending_method: paymentMethod,
      deposit_pending_at: new Date().toISOString(),
    })
    .eq("id", estimate.id)
    .eq("org_id", estimate.org_id);

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
