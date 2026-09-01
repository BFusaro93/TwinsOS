import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { chargeIdempotencyKey } from "@/lib/stripe/idempotency";
import { logger } from "@/lib/logger";

const log = logger.child("crm payments refund");

const RefundSchema = z.object({
  refundAmountCents: z.number().int().positive(),
});

const adminClient = () =>
  createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

/**
 * POST /api/crm/payments/[id]/refund — issues a refund for a recorded
 * payment.
 *
 * useRefundPayment() (src/lib/hooks/use-invoices.ts) used to do ONLY the
 * bookkeeping side of a refund — bump crm_payments.refunded_amount_cents,
 * reverse the invoice balance, re-sync the client balance — with no call to
 * Stripe anywhere. Clicking "Issue Refund" on a card/ACH payment made the
 * books say refunded while the client's card/bank was never actually
 * credited; the org silently kept the money. This route does the Stripe
 * side FIRST (for any payment that has a stripe_payment_intent_id) and only
 * applies the bookkeeping once Stripe confirms the refund — a payment with
 * no stripe_payment_intent_id (cash/check/manually-recorded) skips Stripe
 * entirely and is bookkeeping-only, same as before, since there's no real
 * charge to reverse.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: paymentId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 403 });

  // Granular per-role permission — admins always pass. Any of the three
  // card/ACH/refund-void keys grants access; the catalog doesn't split this
  // one action by payment method in practice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const permissionChecks = await Promise.all(
    ["acct_process_cc_refunds_voids", "acct_delete_card_payments", "acct_delete_ach_payments"].map((key) =>
      (supabase.rpc as any)("has_settings_permission", { p_key: key })
    )
  );
  const allowed = permissionChecks.some((r) => r.data === true);
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = RefundSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  const { refundAmountCents } = parsed.data;

  const db = adminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: payment, error: paymentErr } = await (db as any)
    .from("crm_payments")
    .select("id, org_id, client_id, invoice_id, amount_cents, refunded_amount_cents, stripe_payment_intent_id, method")
    .eq("id", paymentId)
    .eq("org_id", profile.org_id)
    .single();
  if (paymentErr || !payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  if (payment.refunded_amount_cents + refundAmountCents > payment.amount_cents) {
    return NextResponse.json({ error: "Refund amount exceeds remaining refundable balance" }, { status: 400 });
  }

  if (payment.stripe_payment_intent_id) {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: "Card payments are not configured" }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: org } = await (db as any)
      .from("organizations")
      .select("stripe_connect_account_id")
      .eq("id", profile.org_id)
      .single();
    if (!org?.stripe_connect_account_id) {
      return NextResponse.json({ error: "Organization has no connected Stripe account" }, { status: 400 });
    }

    try {
      const stripe = getStripe();
      await stripe.refunds.create(
        {
          payment_intent: payment.stripe_payment_intent_id,
          amount: refundAmountCents,
        },
        {
          stripeAccount: org.stripe_connect_account_id,
          idempotencyKey: chargeIdempotencyKey(["refund", paymentId, refundAmountCents]),
        }
      );
    } catch (err) {
      log.error("stripe refund failed", { error: err, paymentId });
      const message = err instanceof Error ? err.message : "Stripe refund failed";
      // Nothing in the DB has been touched yet — fail closed so the books
      // never say "refunded" unless Stripe actually moved the money.
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: refundErr } = await (db.rpc as any)("refund_payment", {
    p_payment_id: paymentId,
    p_refund_amount_cents: refundAmountCents,
  });
  if (refundErr) {
    log.error("refund_payment RPC failed after Stripe refund succeeded — manual reconciliation needed", { error: refundErr, paymentId });
    return NextResponse.json({ error: "Refund processed with Stripe but failed to record — contact support" }, { status: 500 });
  }

  // Reverse the refund across every invoice this payment was actually
  // allocated to, proportionally — a payment split across multiple
  // invoices has no single invoice_id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: allocations } = await (db as any)
    .from("crm_payment_allocations")
    .select("invoice_id, amount_cents")
    .eq("payment_id", paymentId);

  if (allocations && allocations.length > 0) {
    const totalAllocated = allocations.reduce((s: number, a: { amount_cents: number }) => s + a.amount_cents, 0);
    let remaining = refundAmountCents;
    for (let i = 0; i < allocations.length; i++) {
      const a = allocations[i];
      const share = i === allocations.length - 1
        ? remaining
        : Math.round((refundAmountCents * a.amount_cents) / totalAllocated);
      remaining -= share;
      if (share > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db.rpc as any)("apply_payment_to_invoice", { p_invoice_id: a.invoice_id, p_delta_cents: -share });
      }
    }
  } else if (payment.invoice_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.rpc as any)("apply_payment_to_invoice", { p_invoice_id: payment.invoice_id, p_delta_cents: -refundAmountCents });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.rpc as any)("sync_client_balance", { p_client_id: payment.client_id });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).from("client_activity").insert({
    org_id: profile.org_id,
    client_id: payment.client_id,
    activity_type: "payment",
    subject: `Refund issued: $${(refundAmountCents / 100).toFixed(2)}`,
    ref_id: paymentId,
    ref_table: "crm_payments",
    amount_cents: -refundAmountCents,
  });

  return NextResponse.json({ ok: true });
}
