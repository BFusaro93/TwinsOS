import type Stripe from "stripe";

export const SMS_INCLUDED_PER_PERIOD = 500;
export const SMS_OVERAGE_BLOCK_SIZE = 250;
export const SMS_OVERAGE_BLOCK_CENTS = 1000; // $10 per 250 messages over the included 500

/**
 * Bills the SMS add-on's block overage ($10 per 250 messages past the 500
 * included) as a one-off invoice item that lands on the org's next Stripe
 * invoice — not a native Stripe metered price, since block-of-250 pricing
 * doesn't map cleanly onto Stripe's per-unit tiered pricing. Idempotent
 * per period: only ever bills the delta between what this period has
 * already had invoiced (row.overage_billed_cents) and what's now owed, so
 * running this daily as usage climbs never double-bills the same messages.
 */
export async function billSmsOverageForPeriod(
  stripe: Stripe,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  org: { id: string; stripe_customer_id: string | null },
  usage: { period_start: string; count: number; overage_billed_cents: number }
): Promise<void> {
  if (!org.stripe_customer_id) return;

  const overageCount = Math.max(0, usage.count - SMS_INCLUDED_PER_PERIOD);
  const blocks = Math.ceil(overageCount / SMS_OVERAGE_BLOCK_SIZE);
  const owedCents = blocks * SMS_OVERAGE_BLOCK_CENTS;
  const deltaCents = owedCents - usage.overage_billed_cents;
  if (deltaCents <= 0) return;

  await stripe.invoiceItems.create({
    customer: org.stripe_customer_id,
    amount: deltaCents,
    currency: "usd",
    description: `SMS overage — ${overageCount} messages past the ${SMS_INCLUDED_PER_PERIOD} included this period`,
  });

  const { error } = await db
    .from("organization_sms_usage")
    .update({ overage_billed_cents: owedCents })
    .eq("org_id", org.id)
    .eq("period_start", usage.period_start);
  if (error) throw error;
}
