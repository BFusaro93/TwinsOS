"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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

/**
 * Gates a module (Landscapt/Equipt) by the org's subscription plan — separate
 * from per-user role gates like useCrmAccess. A DOWNGRADE_STATUSES webhook
 * event reverts an org's plan to "trial", which getModulesForPlan treats as
 * full access, so a lapsed subscription never locks an org out mid-session;
 * enforcement here is about which paid tier an org is actively on, not a
 * punitive lockout.
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
 * Gates a bundled add-on (e.g. Job Photos) by the org's subscription plan.
 * Shares useModuleAccess's query key so both hooks read the same cached
 * org.plan fetch instead of issuing a duplicate request.
 */
export function useAddonAccess(addon: BundledAddonKey): { allowed: boolean; isLoading: boolean } {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-plan-for-module-access"],
    queryFn: () => fetchOrgPlan(queryClient),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || data == null) return { allowed: true, isLoading: true };
  return { allowed: planIncludesAddon(data, addon), isLoading: false };
}
