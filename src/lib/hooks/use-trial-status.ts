"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface TrialStatus {
  isTrial: boolean;
  isExpired: boolean;
  trialEndsAt: string | null;
  daysRemaining: number;
}

/**
 * Trial expiry is enforced client-side only, same as module gating
 * (useModuleAccess) — a UX gate, not a security boundary. An org past its
 * trial window is hard-locked out of the Landscapt/Equipt shells (see
 * TrialExpiredGate) but Settings/Billing stay reachable so they can
 * actually subscribe.
 */
export function useTrialStatus(): TrialStatus & { isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["org-trial-status"],
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return null;
      const { data: org, error } = await supabase
        .from("organizations")
        .select("plan, trial_ends_at")
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;
      return { plan: org.plan, trialEndsAt: org.trial_ends_at };
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || data == null) {
    return { isTrial: false, isExpired: false, trialEndsAt: null, daysRemaining: 0, isLoading: true };
  }

  const isTrial = data.plan === "trial";
  const trialEndsAt = data.trialEndsAt;
  const msRemaining = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : Infinity;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  const isExpired = isTrial && trialEndsAt != null && msRemaining <= 0;

  return { isTrial, isExpired, trialEndsAt, daysRemaining, isLoading: false };
}
