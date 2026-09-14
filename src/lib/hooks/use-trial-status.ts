"use client";

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/hooks/use-current-profile";

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
async function fetchTrialStatus(queryClient: QueryClient) {
  const profile = await fetchCurrentProfile(queryClient);
  if (!profile) return null;
  const supabase = createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("plan, trial_ends_at")
    .eq("id", profile.orgId)
    .single();
  if (error) throw error;
  return { plan: org.plan, trialEndsAt: org.trial_ends_at };
}

export function useTrialStatus(): TrialStatus & { isLoading: boolean } {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-trial-status"],
    queryFn: () => fetchTrialStatus(queryClient),
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
