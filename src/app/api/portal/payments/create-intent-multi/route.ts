import { NextResponse } from "next/server";
import { z } from "zod";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { stripeErrorResponse } from "@/lib/stripe/errors";
import { logger } from "@/lib/logger";
import { applyCreditBeforeCharge } from "@/lib/stripe/apply-credit-first";
import { createServiceClient } from "@/lib/supabase/server";
import { getPortalAccounts, getPortalContext } from "@/lib/portal/get-portal-context";
import { getStripeForOrg, isStripeConfigured, isStripeTestConfigured } from "@/lib/stripe/server";
import { computeProcessingFee, encodeAllocations, MAX_ALLOCATION_METADATA_LENGTH } from "@/lib/stripe/crm-payments";
import { achEnabledForAccount } from "@/lib/stripe/connect";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { surchargeIntentMetadata, surchargeIntentParams } from "@/lib/stripe/surcharge-capture";
import { refuseIfChargeInFlight, ensureIntentCustomer, cancelMicrodepositIntents } from "@/lib/stripe/duplicate-charge";
import { reuseOrCancelOpenIntent, rememberOpenIntent } from "@/lib/stripe/open-intent";

const log = logger.child("portal create-intent-multi");

// Stripe rejects charges under 50 cents.
const STRIPE_MIN_CHARGE_CENTS = 50;

const Schema = z.object({
  // Each invoice is paid in full — the portal never splits a balance.
  invoiceIds: z
    .array(z.string().uuid())
    .min(1)
    .max(40)
    .refine((ids) => new Set(ids).size === ids.length, "Each invoice can only appear once"),
  paymentMethod: z.enum(["card", "us_bank_account"]).default("card"),
  /** The customer chose to cancel a bank payment that is waiting on
   * micro-deposit verification and pay another way instead. */
  cancelPendingBankPayment: z.boolean().optional(),
});

/**
 * One card/bank charge that settles several of the customer's invoices at once
 * (Billing tab: "Select All Unpaid" → Pay). Same shape as the staff-side
 * create-intent-multi: the intent's metadata carries an encoded allocation list
 * and the Connect webhook is the only writer that applies it.
 *
 * A parent login can pay its sub-accounts' invoices together with its own:
 * the parent is the payer (crm_payments.client_id) and each invoice gets its
 * own allocation — record_stripe_invoice_payment accepts an invoice of the
 * payer or of one of its child sub-accounts. A selection from a single
 * account still records against that account, as before.
 */
export async function POST(request: Request) {
  if (!isStripeConfigured() && !isStripeTestConfigured()) {
    return NextResponse.json({ error: "Card payments are not configured yet" }, { status: 400 });
  }

  const ctx = await getPortalContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkAuthRateLimit(`portal-pay-intent:${ctx.clientId}`, 20, 600))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
  }

  const parsed = Schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { invoiceIds, paymentMethod, cancelPendingBankPayment } = parsed.data;

  // Portal users have no RLS read path to clients / crm_invoices — service

  // client, scoped to this login (ctx is server-derived) on every query below.

  const supabase = createServiceClient();
  const [{ data: invoices }, accounts] = await Promise.all([
    supabase
      .from("crm_invoices")
      .select("id, org_id, client_id, balance_cents, status, open_dispute_payment_id")
      .in("id", invoiceIds)
      .eq("org_id", ctx.orgId)
      .neq("status", "draft")
      .is("deleted_at", null),
    getPortalAccounts(ctx),
  ]);
  const accountIds = new Set(accounts.map((a) => a.id));
  if (!invoices || invoices.length !== invoiceIds.length || invoices.some((i) => !accountIds.has(i.client_id))) {
    return NextResponse.json({ error: "One or more invoices were not found" }, { status: 404 });
  }
  // One account → that account pays. Several → the login's own account (the
  // parent) pays; getPortalAccounts only ever returns the login plus its own
  // sub-accounts, so every invoice here is the parent's or a child's.
  const clientId = invoices.every((i) => i.client_id === invoices[0].client_id) ? invoices[0].client_id : ctx.clientId;
  if (invoices.some((i) => i.status === "void")) {
    return NextResponse.json({ error: "A selected invoice has been voided" }, { status: 400 });
  }
  if (invoices.some((i) => i.balance_cents <= 0)) {
    return NextResponse.json({ error: "A selected invoice has no balance due — refresh and try again" }, { status: 400 });
  }
  if (invoices.some((i) => i.open_dispute_payment_id)) {
    return NextResponse.json({ error: "One of these invoices can't be paid online right now. Please contact us." }, { status: 409 });
  }

  // Portal users have no profiles row, so read the org with the service client
  // (ctx.orgId is server-derived).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: org } = await (createServiceClient().from("organizations") as any)
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

    const service = createServiceClient();
    const customerId = await ensureIntentCustomer({
      stripe,
      connectedAccountId: org.stripe_connect_account_id,
      serviceDb: service,
      orgId: ctx.orgId,
      clientId,
    });
    if (cancelPendingBankPayment) {
      await cancelMicrodepositIntents({
        stripe,
        connectedAccountId: org.stripe_connect_account_id,
        db: service,
        invoiceIds,
        customerId,
      });
    }
    const refusal = await refuseIfChargeInFlight({
      stripe,
      connectedAccountId: org.stripe_connect_account_id,
      db: service,
      invoiceIds,
      customerId,
      isAch: paymentMethod === "us_bank_account",
      plural: true,
    });
    if (refusal) return NextResponse.json({ error: refusal.body.error, code: refusal.body.code }, { status: refusal.status });

    const allocations = invoices.map((i) => ({ invoiceId: i.id, amountCents: i.balance_cents }));
    const invoiceClient = new Map(invoices.map((i) => [i.id, i.client_id]));
    // Refused before any credit is consumed, so a refusal never leaves invoices changed.
    if (encodeAllocations(allocations).length > MAX_ALLOCATION_METADATA_LENGTH) {
      return NextResponse.json({ error: "Too many invoices for a single payment — please pay them in two batches." }, { status: 400 });
    }

    // Settle each invoice with any credit/deposit on the account first, so the
    // card only pays what is still owed.
    try {
      for (const a of allocations) {
        // Each invoice is settled from its OWN account's credit — a sub-account's
        // prepayment belongs to that sub-account.
        a.amountCents = await applyCreditBeforeCharge(service, {
          id: a.invoiceId,
          client_id: invoiceClient.get(a.invoiceId) ?? clientId,
          balance_cents: a.amountCents,
        });
      }
    } catch {
      return NextResponse.json({ error: "We couldn't apply your account credit. Please try again or contact us." }, { status: 500 });
    }
    const stillOwed = allocations.filter((a) => a.amountCents > 0);
    if (stillOwed.length === 0) {
      return NextResponse.json({ error: "Your account credit has paid these invoices in full — no payment needed. Refresh to see it." }, { status: 409 });
    }

    const encoded = encodeAllocations(stillOwed);
    const balanceCents = stillOwed.reduce((sum, a) => sum + a.amountCents, 0);
    const { feeCents, totalChargeCents } =
      paymentMethod === "card"
        ? computeProcessingFee(
            {
              ccProcessingFeeEnabled: org.cc_processing_fee_enabled,
              ccProcessingFeeBps: org.cc_processing_fee_bps,
              ccProcessingFeeThresholdCents: org.cc_processing_fee_threshold_cents,
              ccProcessingFeeMode: (org.customizations as Record<string, unknown> | null)?.cc_processing_fee_mode as string | undefined,
            },
            balanceCents,
            false
          )
        : { feeCents: 0, totalChargeCents: balanceCents };

    if (totalChargeCents < STRIPE_MIN_CHARGE_CENTS) {
      return NextResponse.json(
        { error: "The remaining balance is below the $0.50 minimum for online payments. Please contact us to settle it." },
        { status: 400 }
      );
    }

    const intentMetadata = {
      source: "crm_invoice_multi",
      org_id: ctx.orgId,
      client_id: clientId,
      allocations: encoded,
      fee_cents: String(feeCents),
    };
    // One open form per invoice — see the single-invoice route.
    const reused = await reuseOrCancelOpenIntent({
      stripe,
      connectedAccountId: org.stripe_connect_account_id,
      db: service,
      orgId: ctx.orgId,
      invoiceIds: stillOwed.map((a) => a.invoiceId),
      amountCents: totalChargeCents,
      paymentMethod,
      metadata: intentMetadata,
    });
    if (reused) {
      return NextResponse.json({
        clientSecret: reused.client_secret,
        connectedAccountId: org.stripe_connect_account_id,
        livemode: org.stripe_connect_livemode ?? true,
        balanceCents,
        feeCents,
        totalChargeCents,
      });
    }

    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalChargeCents,
        currency: "usd",
        payment_method_types: [paymentMethod],
        ...surchargeIntentParams(feeCents, paymentMethod === "card"),
        ...(customerId ? { customer: customerId } : {}),
        metadata: {
          ...intentMetadata,
          ...surchargeIntentMetadata(feeCents, paymentMethod === "card"),
        },
      },
      {
        stripeAccount: org.stripe_connect_account_id,
        idempotencyKey: chargeIdempotencyKey(["crm_invoice_multi_portal", clientId, encoded, totalChargeCents, paymentMethod]),
      }
    );
    await rememberOpenIntent(service, ctx.orgId, stillOwed.map((a) => a.invoiceId), paymentIntent.id);

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      connectedAccountId: org.stripe_connect_account_id,
      livemode: org.stripe_connect_livemode ?? true,
      balanceCents,
      feeCents,
      totalChargeCents,
    });
  } catch (err) {
    return stripeErrorResponse(err, log, { clientId, connectedAccountId: org.stripe_connect_account_id });
  }
}
