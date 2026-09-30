import type Stripe from "stripe";
import { BILLABLE_PLANS, getSeatConfig, isBillablePlan, type BillablePlan } from "./plans";

const SEAT_OVERAGE_ENV_VAR: Record<BillablePlan, string> = {
  starter: "STRIPE_PRICE_SEAT_OVERAGE_STARTER",
  cmms: "STRIPE_PRICE_SEAT_OVERAGE_CMMS",
  growth: "STRIPE_PRICE_SEAT_OVERAGE_GROWTH",
  enterprise: "STRIPE_PRICE_SEAT_OVERAGE_ENTERPRISE",
};

export function getSeatOveragePriceIdForPlan(plan: BillablePlan): string | null {
  return process.env[SEAT_OVERAGE_ENV_VAR[plan]] ?? null;
}

/**
 * Soft-nudge seat billing: an org can add seats past its plan's included
 * count without being blocked (see the SubscriptionTab overage note), and
 * this keeps the subscription's seat-overage line item in sync with actual
 * usage so the extra seats bill automatically next cycle instead of the org
 * needing to manually adjust anything.
 *
 * Called from two places: the billing webhook (covers new subscribes and
 * plan changes, which already carry a fresh Subscription object) and the
 * daily sync-seat-overage cron (covers seat count changes that don't fire
 * any Stripe event at all, e.g. inviting an employee mid-cycle).
 *
 * Stripe subscription items can't hold quantity 0, so the item is created
 * only once there's real overage and removed once the org is back within
 * its included seats, rather than ever being set to 0.
 */
export async function syncSeatOverage(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  plan: string,
  seatsUsed: number,
  overrides: { seatsIncludedOverride?: number | null; seatOverageCentsOverride?: number | null } = {}
): Promise<void> {
  if (!isBillablePlan(plan)) return;
  const overagePriceId = getSeatOveragePriceIdForPlan(plan);

  // A plan change swaps the base price but leaves the OLD plan's overage
  // item on the subscription — without this the org is billed seat overage
  // twice (old plan's item + the new one created below). Two plans can share
  // one overage price id, so never delete the current plan's id.
  const otherOveragePriceIds = new Set(
    BILLABLE_PLANS.map((p) => getSeatOveragePriceIdForPlan(p.plan))
      .filter((id): id is string => !!id && id !== overagePriceId)
  );
  for (const item of subscription.items.data) {
    if (otherOveragePriceIds.has(item.price.id)) {
      try {
        await stripe.subscriptionItems.del(item.id, { proration_behavior: "create_prorations" });
      } catch (err) {
        // A webhook retry replays the same item list — already gone is fine.
        if ((err as { code?: string }).code !== "resource_missing") throw err;
      }
    }
  }

  if (!overagePriceId) return; // not configured in Stripe yet — skip silently, same as other optional prices

  const { seatsIncluded } = getSeatConfig(plan, overrides);
  const overageSeats = Math.max(0, seatsUsed - seatsIncluded);

  const existingItem = subscription.items.data.find((item) => item.price.id === overagePriceId);

  if (overageSeats === 0) {
    if (existingItem) {
      await stripe.subscriptionItems.del(existingItem.id, { proration_behavior: "create_prorations" });
    }
    return;
  }

  if (existingItem) {
    if (existingItem.quantity !== overageSeats) {
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: overageSeats,
        proration_behavior: "create_prorations",
      });
    }
  } else {
    await stripe.subscriptionItems.create({
      subscription: subscription.id,
      price: overagePriceId,
      quantity: overageSeats,
      proration_behavior: "create_prorations",
    });
  }
}
