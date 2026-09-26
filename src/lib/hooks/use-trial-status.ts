"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/hooks/use-current-profile";

export interface TrialStatus {
  isTrial: boolean;
  /** Locked out of the app shells — trial ended, or a canceled org's 90 days are up. */
  isExpired: boolean;
  /** Why isExpired is set, so the lockout screen can say the right thing. */
  lockReason: "trial" | "canceled" | null;
  trialEndsAt: string | null;
  daysRemaining: number;
  /** Canceled subscription, still inside its read-only window. */
  isReadOnly: boolean;
  /** When a canceled org's read-only access ends. */
  accessEndsAt: string | null;
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
    .select("plan, trial_ends_at, canceled_access_ends_at")
    .eq("id", profile.orgId)
    .single();
  if (error) throw error;
  return { plan: org.plan, trialEndsAt: org.trial_ends_at, accessEndsAt: org.canceled_access_ends_at };
}

export function useTrialStatus(): TrialStatus & { isLoading: boolean } {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-trial-status"],
    queryFn: () => fetchTrialStatus(queryClient),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || data == null) {
    return {
      isTrial: false, isExpired: false, lockReason: null, trialEndsAt: null, daysRemaining: 0,
      isReadOnly: false, accessEndsAt: null, isLoading: true,
    };
  }

  if (data.plan === "canceled") {
    // Read-only (RLS blocks writes) until accessEndsAt, then locked out.
    // A missing end date is treated as already ended rather than open-ended.
    const accessEndsAt = data.accessEndsAt;
    const msLeft = accessEndsAt ? new Date(accessEndsAt).getTime() - Date.now() : 0;
    const ended = msLeft <= 0;
    return {
      isTrial: false,
      isExpired: ended,
      lockReason: ended ? "canceled" : null,
      trialEndsAt: null,
      daysRemaining: Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24))),
      isReadOnly: !ended,
      accessEndsAt,
      isLoading: false,
    };
  }

  const isTrial = data.plan === "trial";
  const trialEndsAt = data.trialEndsAt;
  const msRemaining = trialEndsAt ? new Date(trialEndsAt).getTime() - Date.now() : Infinity;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
  const isExpired = isTrial && trialEndsAt != null && msRemaining <= 0;

  return {
    isTrial, isExpired, lockReason: isExpired ? "trial" : null, trialEndsAt, daysRemaining,
    isReadOnly: false, accessEndsAt: null, isLoading: false,
  };
}
