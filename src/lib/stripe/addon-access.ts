import type { createClient } from "@supabase/supabase-js";
import { planIncludesAddon, type BundledAddonKey } from "./plans";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = ReturnType<typeof createClient<any>>;

/**
 * Whether an org is entitled to a bundled/purchasable add-on right now —
 * either its plan bundles the add-on (e.g. api_access on Enterprise), or it
 * bought the add-on standalone (organization_addons.enabled = true). Same
 * two-step check already used inline for Route Optimization in
 * src/app/api/crm/route-optimize/route.ts, factored out here since API
 * access needs the identical check at more than one call site.
 */
export async function orgHasAddon(db: AnyClient, orgId: string, addon: BundledAddonKey): Promise<boolean> {
  const { data: org } = await db.from("organizations").select("plan, trial_ends_at").eq("id", orgId).single();
  // A trial bundles everything, but only until it ends (null = open-ended).
  const trialExpired =
    org?.plan === "trial" && org.trial_ends_at != null && new Date(org.trial_ends_at).getTime() <= Date.now();
  if (org?.plan === "canceled") return false;
  if (org && !trialExpired && planIncludesAddon(org.plan, addon)) return true;

  const { data: addonRow } = await db
    .from("organization_addons")
    .select("enabled")
    .eq("org_id", orgId)
    .eq("addon_key", addon)
    .eq("enabled", true)
    .not("stripe_subscription_item_id", "is", null)
    .maybeSingle();
  return !!addonRow;
}
