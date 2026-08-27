import type { PlatformModule } from "./plans";

// `modules` names which product(s) an add-on is actually usable in — SMS and
// route optimization are Landscapt-only concepts (client texting, job/stop
// routing); an Equipt-only org has no client entity and nothing to route, so
// these must never be offered to it, on the marketing site or in Settings.
export const ADDON_CATALOG = [
  { key: "sms", label: "SMS / Automations Volume", envVar: "STRIPE_PRICE_ADDON_SMS", metered: true, modules: ["landscapt"] as PlatformModule[] },
  { key: "job_photos", label: "Job Photos", envVar: "STRIPE_PRICE_ADDON_JOB_PHOTOS", metered: false, modules: ["landscapt"] as PlatformModule[] },
  { key: "client_portal", label: "Client Portal", envVar: "STRIPE_PRICE_ADDON_CLIENT_PORTAL", metered: false, modules: ["landscapt"] as PlatformModule[] },
  { key: "route_optimization", label: "Route Optimization", envVar: "STRIPE_PRICE_ADDON_ROUTE_OPTIMIZATION", metered: false, modules: ["landscapt"] as PlatformModule[] },
  { key: "advanced_reporting", label: "Advanced Reporting", envVar: "STRIPE_PRICE_ADDON_ADVANCED_REPORTING", metered: false, modules: ["landscapt", "equipt"] as PlatformModule[] },
  { key: "api_access", label: "API Access", envVar: "STRIPE_PRICE_ADDON_API_ACCESS", metered: false, modules: ["landscapt", "equipt"] as PlatformModule[] },
] as const;

export type AddonKey = (typeof ADDON_CATALOG)[number]["key"];

export function addonAppliesToModules(key: AddonKey, orgModules: readonly string[]): boolean {
  const entry = ADDON_CATALOG.find((a) => a.key === key);
  if (!entry) return false;
  return entry.modules.some((m) => (orgModules as readonly string[]).includes(m));
}

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
