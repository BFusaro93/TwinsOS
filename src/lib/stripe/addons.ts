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
