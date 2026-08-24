"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { planIncludesModule, planIncludesAddon, type PlatformModule, type BundledAddonKey } from "@/lib/stripe/plans";

/**
 * Gates a module (Landscapt/Equipt) by the org's subscription plan — separate
 * from per-user role gates like useCrmAccess. A DOWNGRADE_STATUSES webhook
 * event reverts an org's plan to "trial", which getModulesForPlan treats as
 * full access, so a lapsed subscription never locks an org out mid-session;
 * enforcement here is about which paid tier an org is actively on, not a
 * punitive lockout.
 */
export function useModuleAccess(module: PlatformModule): { allowed: boolean; isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["org-plan-for-module-access"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (!profile) return null;
      const { data: org, error } = await supabase
        .from("organizations")
        .select("plan")
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;
      return org.plan;
    },
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
  const { data, isLoading } = useQuery({
    queryKey: ["org-plan-for-module-access"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (!profile) return null;
      const { data: org, error } = await supabase
        .from("organizations")
        .select("plan")
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;
      return org.plan;
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || data == null) return { allowed: true, isLoading: true };
  return { allowed: planIncludesAddon(data, addon), isLoading: false };
}
