import { planIncludesModule, type PlatformModule } from "./plans";

export const ADDON_CATALOG = [
  { key: "sms", label: "SMS / Automations Volume", envVar: "STRIPE_PRICE_ADDON_SMS", metered: true },
  { key: "job_photos", label: "Job Photos", envVar: "STRIPE_PRICE_ADDON_JOB_PHOTOS", metered: false },
  { key: "client_portal", label: "Client Portal", envVar: "STRIPE_PRICE_ADDON_CLIENT_PORTAL", metered: false },
  { key: "route_optimization", label: "Route Optimization", envVar: "STRIPE_PRICE_ADDON_ROUTE_OPTIMIZATION", metered: false },
  { key: "advanced_reporting", label: "Advanced Reporting", envVar: "STRIPE_PRICE_ADDON_ADVANCED_REPORTING", metered: false },
  { key: "api_access", label: "API Access", envVar: "STRIPE_PRICE_ADDON_API_ACCESS", metered: false },
] as const;

export type AddonKey = (typeof ADDON_CATALOG)[number]["key"];

export function isAddonKey(value: string): value is AddonKey {
  return ADDON_CATALOG.some((a) => a.key === value);
}

export function getAddonConfig(key: AddonKey) {
  const entry = ADDON_CATALOG.find((a) => a.key === key);
  if (!entry) throw new Error(`Unknown addon "${key}"`);
  return entry;
}

export function getPriceIdForAddon(key: AddonKey): string | null {
  return process.env[getAddonConfig(key).envVar] ?? null;
}

// Add-ons whose underlying capability only exists within a specific module —
// SMS/Client Portal/Route Optimization/Advanced Reporting are all Landscapt
// (CRM client, dispatch, and job-costing) concepts with nothing for an
// Equipt-only ("cmms") org to attach to. Omitted here = usable regardless of
// which modules a plan includes (job_photos is reachable from Equipt's own
// nav today; api_access isn't module-specific).
const ADDON_REQUIRES_MODULE: Partial<Record<AddonKey, PlatformModule>> = {
  sms: "landscapt",
  client_portal: "landscapt",
  route_optimization: "landscapt",
  advanced_reporting: "landscapt",
};

/** Whether an add-on is even applicable to a plan, independent of whether it's bundled/purchasable at a price — used to hide add-ons a plan's modules can't use at all. */
export function addonAvailableForPlan(plan: string, addon: AddonKey): boolean {
  const requiredModule = ADDON_REQUIRES_MODULE[addon];
  if (!requiredModule) return true;
  return planIncludesModule(plan, requiredModule);
}
