"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/hooks/use-current-profile";
import { planIncludesModule, planIncludesAddon, type PlatformModule, type BundledAddonKey } from "@/lib/stripe/plans";

async function fetchOrgPlan(queryClient: QueryClient): Promise<string | null> {
  const profile = await fetchCurrentProfile(queryClient);
  if (!profile) return null;
  const supabase = createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("plan")
    .eq("id", profile.orgId)
    .single();
  if (error) throw error;
  return org.plan;
}

async function fetchPurchasedAddons(queryClient: QueryClient): Promise<string[]> {
  const profile = await fetchCurrentProfile(queryClient);
  if (!profile) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("organization_addons")
    .select("addon_key")
    .eq("org_id", profile.orgId)
    .eq("enabled", true)
    // Purchased = backed by a Stripe subscription item (bundled/trial access
    // comes from the plan, not from a row).
    .not("stripe_subscription_item_id", "is", null);
  if (error) throw error;
  return data.map((row) => row.addon_key);
}

/**
 * Gates a module (Landscapt/Equipt) by the org's subscription plan — separate
 * from per-user role gates like useCrmAccess. A DOWNGRADE_STATUSES webhook
 * event moves an org to plan "canceled", which keeps both modules visible
 * (read-only, enforced by RLS) until the 90-day lockout in useTrialStatus;
 * enforcement here is about which paid tier an org is actively on.
 */
export function useModuleAccess(module: PlatformModule): { allowed: boolean; isLoading: boolean } {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-plan-for-module-access"],
    queryFn: () => fetchOrgPlan(queryClient),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || data == null) return { allowed: true, isLoading: true }; // avoid a flash of the denied screen while loading
  return { allowed: planIncludesModule(data, module), isLoading: false };
}

/**
 * Gates an add-on (e.g. Job Photos) the same way orgHasAddon does server-side:
 * allowed if the org's plan bundles it OR the org bought it standalone
 * (organization_addons.enabled). Shares useModuleAccess's query key so both
 * hooks read the same cached org.plan fetch instead of issuing a duplicate
 * request.
 */
export function useAddonAccess(addon: BundledAddonKey): { allowed: boolean; isLoading: boolean } {
  const queryClient = useQueryClient();
  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ["org-plan-for-module-access"],
    queryFn: () => fetchOrgPlan(queryClient),
    staleTime: 5 * 60 * 1000,
  });
  const { data: purchased, isLoading: addonsLoading } = useQuery({
    queryKey: ["org-addons-for-access"],
    queryFn: () => fetchPurchasedAddons(queryClient),
    staleTime: 5 * 60 * 1000,
  });

  if (planLoading || plan == null) return { allowed: true, isLoading: true };
  if (plan === "canceled") return { allowed: false, isLoading: false };
  if (planIncludesAddon(plan, addon)) return { allowed: true, isLoading: false };
  if (addonsLoading || purchased == null) return { allowed: true, isLoading: true };
  return { allowed: purchased.includes(addon), isLoading: false };
}
