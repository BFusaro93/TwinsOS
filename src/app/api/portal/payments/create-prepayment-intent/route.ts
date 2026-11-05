import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/server";
import { getPortalAccounts, getPortalContext } from "@/lib/portal/get-portal-context";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { computeProcessingFee } from "@/lib/stripe/crm-payments";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { surchargeIntentMetadata, surchargeIntentParams } from "@/lib/stripe/surcharge-capture";
import { ensureIntentCustomer } from "@/lib/stripe/duplicate-charge";
import {
  PORTAL_PREPAYMENT_MAX_CENTS,
  PORTAL_PREPAYMENT_MIN_CENTS,
} from "@/lib/stripe/record-client-prepayment";

const log = logger.child("portal create-prepayment-intent");

const Schema = z.object({
  amountCents: z.number().int().min(PORTAL_PREPAYMENT_MIN_CENTS).max(PORTAL_PREPAYMENT_MAX_CENTS),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
  // One per opened dialog. A prepayment has no invoice to key the charge on, so
  // without this a second legitimate prepayment of the same amount inside
  // Stripe's 24h idempotency window would hand back the FIRST (already paid)
  // intent. A double-clicked button still shares the nonce and collapses.
  nonce: z.string().uuid(),
  // A parent login may prepay for one of its sub-accounts; defaults to its own.
  accountId: z.string().uuid().optional(),
});

/**
 * "Make a Prepayment" from the portal: a card/bank charge that isn't against
 * any invoice. The Connect webhook is the only writer — it records the charge as
 * an unapplied prepayment (account credit) via recordClientPrepaymentCharge, and
 * the credit settles the next invoice the same way a staff-entered prepayment
 * does. It never applies automatically to an existing invoice or scheduled job.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkAuthRateLimit(`portal-prepay-intent:${ctx.clientId}`, 15, 600))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a prepayment amount between $1.00 and $25,000.00." }, { status: 400 });
  }
  const { amountCents, paymentMethod, nonce, accountId } = parsed.data;

  const accounts = await getPortalAccounts(ctx);
  const clientId = accountId ?? ctx.clientId;
  if (!accounts.some((a) => a.id === clientId)) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const service = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (service.from("organizations") as any)
    .select(
      "cc_processing_fee_enabled, cc_processing_fee_bps, cc_processing_fee_threshold_cents, customizations, stripe_connect_account_id, stripe_connect_charges_enabled, ach_payments_enabled, stripe_connect_livemode"
    )
    .eq("id", ctx.orgId)
    .single();
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  if (!org.stripe_connect_account_id || !org.stripe_connect_charges_enabled) {
    return NextResponse.json({ error: "Online payments aren't available yet." }, { status: 400 });
  }

  const stripe = getStripeForOrg(org.stripe_connect_livemode);

  try {
    if (paymentMethod === "us_bank_account") {
      if (!org.ach_payments_enabled || !(await achEnabledForAccount(stripe, org.stripe_connect_account_id))) {
        return NextResponse.json({ error: "Bank transfer isn't available yet — please pay by card." }, { status: 400 });
      }
    }

    const customerId = await ensureIntentCustomer({
      stripe,
      connectedAccountId: org.stripe_connect_account_id,
      serviceDb: service,
      orgId: ctx.orgId,
      clientId,
    });

    // Same split as an invoice: the processing fee is the org's revenue, never
    // credited to the customer. Only the prepayment amount becomes credit.
    const { feeCents, totalChargeCents } =
      paymentMethod === "card"
        ? computeProcessingFee(
            {
              ccProcessingFeeEnabled: org.cc_processing_fee_enabled,
              ccProcessingFeeBps: org.cc_processing_fee_bps,
              ccProcessingFeeThresholdCents: org.cc_processing_fee_threshold_cents,
              ccProcessingFeeMode: (org.customizations as Record<string, unknown> | null)?.cc_processing_fee_mode as string | undefined,
            },
            amountCents,
            false
          )
        : { feeCents: 0, totalChargeCents: amountCents };

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalChargeCents,
        currency: "usd",
        payment_method_types: [paymentMethod],
        ...surchargeIntentParams(feeCents, paymentMethod === "card"),
        ...(customerId ? { customer: customerId } : {}),
        metadata: {
          source: "crm_client_prepayment",
          org_id: ctx.orgId,
          client_id: clientId,
          prepayment_cents: String(amountCents),
          fee_cents: String(feeCents),
          ...surchargeIntentMetadata(feeCents, paymentMethod === "card"),
        },
      },
      {
        stripeAccount: org.stripe_connect_account_id,
        idempotencyKey: chargeIdempotencyKey(["crm_client_prepayment_portal", clientId, nonce, totalChargeCents, paymentMethod]),
      }
    );

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      connectedAccountId: org.stripe_connect_account_id,
      livemode: org.stripe_connect_livemode ?? true,
      balanceCents: amountCents,
      feeCents,
      totalChargeCents,
    });
  } catch (err) {
    return stripeErrorResponse(err, log, { clientId, connectedAccountId: org.stripe_connect_account_id });
  }
}
