export const BILLABLE_PLANS = [
  { plan: "starter", label: "Starter", envVar: "STRIPE_PRICE_STARTER" },
  { plan: "growth", label: "Growth", envVar: "STRIPE_PRICE_GROWTH" },
  { plan: "enterprise", label: "Enterprise", envVar: "STRIPE_PRICE_ENTERPRISE" },
] as const;

export type BillablePlan = (typeof BILLABLE_PLANS)[number]["plan"];

export function isBillablePlan(value: string): value is BillablePlan {
  return BILLABLE_PLANS.some((p) => p.plan === value);
}

export function getPriceIdForPlan(plan: BillablePlan): string | null {
  const entry = BILLABLE_PLANS.find((p) => p.plan === plan);
  if (!entry) return null;
  return process.env[entry.envVar] ?? null;
}

export function getPlanForPriceId(priceId: string): BillablePlan | null {
  const entry = BILLABLE_PLANS.find((p) => process.env[p.envVar] === priceId);
  return entry?.plan ?? null;
}
