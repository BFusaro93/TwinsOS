export type PlatformModule = "landscapt" | "equipt";

/** Add-ons a plan already includes at no extra charge — see addons.ts for the full catalog. */
export type BundledAddonKey = "job_photos" | "client_portal" | "route_optimization" | "advanced_reporting" | "api_access";

export const BILLABLE_PLANS = [
  {
    plan: "starter",
    label: "Starter",
    envVar: "STRIPE_PRICE_STARTER",
    modules: ["landscapt"] as PlatformModule[],
    seatsIncluded: 5,
    seatOverageCents: 2000,
    bundledAddons: [] as BundledAddonKey[],
  },
  {
    // Internal key stays "cmms" (matches the STRIPE_PRICE_CMMS/
    // STRIPE_PRICE_SEAT_OVERAGE_CMMS env vars and the DB plan value already
    // in use) — only the customer-facing label changed to match the Equipt
    // product name used everywhere else.
    plan: "cmms",
    label: "Equipt",
    envVar: "STRIPE_PRICE_CMMS",
    modules: ["equipt"] as PlatformModule[],
    seatsIncluded: 5,
    seatOverageCents: 1500,
    bundledAddons: [] as BundledAddonKey[],
  },
  {
    plan: "growth",
    label: "Growth",
    envVar: "STRIPE_PRICE_GROWTH",
    modules: ["landscapt", "equipt"] as PlatformModule[],
    seatsIncluded: 10,
    seatOverageCents: 2000,
    bundledAddons: ["job_photos", "client_portal"] as BundledAddonKey[],
  },
  {
    plan: "enterprise",
    label: "Enterprise",
    envVar: "STRIPE_PRICE_ENTERPRISE",
    modules: ["landscapt", "equipt"] as PlatformModule[],
    seatsIncluded: 20,
    seatOverageCents: 2000,
    bundledAddons: ["job_photos", "client_portal", "route_optimization", "advanced_reporting", "api_access"] as BundledAddonKey[],
  },
] as const;

export type BillablePlan = (typeof BILLABLE_PLANS)[number]["plan"];

export function isBillablePlan(value: string): value is BillablePlan {
  return BILLABLE_PLANS.some((p) => p.plan === value);
}

export function getPlanConfig(plan: BillablePlan) {
  const entry = BILLABLE_PLANS.find((p) => p.plan === plan);
  if (!entry) throw new Error(`Unknown plan "${plan}"`);
  return entry;
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

/** Modules a plan unlocks. Trial orgs (plan === "trial") and anything unrecognized get full access — see AskUserQuestion decision: trial is full-featured for the 30-day window. */
export function getModulesForPlan(plan: string): PlatformModule[] {
  if (isBillablePlan(plan)) return getPlanConfig(plan).modules;
  return ["landscapt", "equipt"];
}

export function planIncludesModule(plan: string, module: PlatformModule): boolean {
  return getModulesForPlan(plan).includes(module);
}

/** Seat count and per-seat overage price for a plan, honoring an org's custom override (Enterprise deals) when set. */
export function getSeatConfig(
  plan: string,
  overrides: { seatsIncludedOverride?: number | null; seatOverageCentsOverride?: number | null } = {}
): { seatsIncluded: number; seatOverageCents: number } {
  const base = isBillablePlan(plan) ? getPlanConfig(plan) : { seatsIncluded: 5, seatOverageCents: 2000 };
  return {
    seatsIncluded: overrides.seatsIncludedOverride ?? base.seatsIncluded,
    seatOverageCents: overrides.seatOverageCentsOverride ?? base.seatOverageCents,
  };
}

export function planIncludesAddon(plan: string, addon: BundledAddonKey): boolean {
  return isBillablePlan(plan) && (getPlanConfig(plan).bundledAddons as readonly string[]).includes(addon);
}
