import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { planIncludesAddon } from "@/lib/stripe/plans";

/**
 * Resolves the Google Maps API key an org actually uses, honoring the
 * plan/add-on entitlement routing.
 *
 * Orgs on a plan that bundles Route Optimization (currently Enterprise) or
 * that bought the standalone $15/mo add-on get our platform key — they
 * shouldn't have to bring their own. Every other org falls back to the key it
 * saved under Settings → Integrations.
 *
 * This used to live only in /api/crm/route-optimize, while /api/crm/jobs/geocode
 * read `customizations.google_maps_api_key` directly — so an entitled org with
 * no key of its own got route optimization but silently no geocoding (no map
 * pins, no Nearby Waiting List). Every Google-backed route shares this now.
 */
export async function resolveGoogleMapsKey(
  sb: ReturnType<typeof createClient<Database>>,
  orgId: string
): Promise<{ apiKey: string } | { error: string; status: number }> {
  const { data: org } = await sb
    .from("organizations")
    .select("customizations, plan")
    .eq("id", orgId)
    .single();

  let entitled = planIncludesAddon(org?.plan ?? "", "route_optimization");
  if (!entitled) {
    const { data: addon } = await sb
      .from("organization_addons")
      .select("enabled")
      .eq("org_id", orgId)
      .eq("addon_key", "route_optimization")
      .eq("enabled", true)
      .maybeSingle();
    entitled = !!addon;
  }

  const orgApiKey = (org?.customizations as Record<string, unknown> | null)
    ?.google_maps_api_key as string | undefined;
  // Prefer the platform key for entitled orgs, but don't block them on it if it
  // hasn't been provisioned yet and they happen to also have their own key set.
  const apiKey = entitled ? (process.env.GOOGLE_MAPS_PLATFORM_API_KEY ?? orgApiKey) : orgApiKey;
  if (!apiKey?.trim()) {
    return {
      error: entitled
        ? "Route Optimization is enabled for this org, but the platform Google Maps key isn't configured. Contact support."
        : "Google Maps API key not configured. Add your own in Settings → Integrations, or purchase the Route Optimization add-on ($15/mo) to use ours.",
      status: 422,
    };
  }
  return { apiKey };
}

/**
 * Statuses that mean "Google itself refused or failed", as opposed to "this
 * address is unknown". Folding the first kind into the second is how a bad key
 * or a blown quota gets reported to the user as "no geocodable address".
 */
export const GOOGLE_FAILURE_STATUSES = new Set([
  "REQUEST_DENIED",
  "OVER_QUERY_LIMIT",
  "OVER_DAILY_LIMIT",
  "INVALID_REQUEST",
  "UNKNOWN_ERROR",
]);
