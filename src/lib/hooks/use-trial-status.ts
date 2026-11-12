"use client";

import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/hooks/use-current-profile";
import { useEffect } from "react";
import { setOrgReadOnlyForErrors } from "@/lib/utils/mutation-error";
import { coerceTimeZone, daysBetweenYmd, isoInZone, todayInZone } from "@/lib/time/zone";

export interface TrialStatus {
  isTrial: boolean;
  /** Locked out of the app shells — a trial or canceled subscription whose 90 read-only days are up. */
  isExpired: boolean;
  /** Why isExpired is set, so the lockout screen can say the right thing. */
  lockReason: "trial" | "canceled" | null;
  trialEndsAt: string | null;
  /**
   * Trial: whole calendar days (org time zone) until the trial's last day — 0
   * on the last day. Read-only: days left until access ends.
   */
  daysRemaining: number;
  /** Read-only window: a canceled subscription, or a trial that has ended, for 90 days. */
  isReadOnly: boolean;
  /** Why isReadOnly is set. */
  readOnlyReason: "trial" | "canceled" | null;
  /** When read-only access ends and the shells lock. */
  accessEndsAt: string | null;
}

/** How long an org keeps read-only access after its trial ends — same as after canceling (billing webhook). */
export const READ_ONLY_ACCESS_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expired trials and canceled subscriptions are READ-ONLY in the database
 * (my_org_is_read_only → the read_only_when_canceled_* policies) from the
 * moment they end. The app shows them read-only for 90 days (view, search,
 * export, email collections) and then locks the Landscapt/Equipt shells
 * (AccessLockedScreen) — a UX gate, not a security boundary; the data stays
 * read-only either way. Settings/Subscription stays reachable so they can
 * subscribe.
 */
async function fetchTrialStatus(queryClient: QueryClient) {
  const profile = await fetchCurrentProfile(queryClient);
  if (!profile) return null;
  const supabase = createClient();
  const { data: org, error } = await supabase
    .from("organizations")
    .select("plan, trial_ends_at, canceled_access_ends_at, timezone")
    .eq("id", profile.orgId)
    .single();
  if (error) throw error;
  return {
    plan: org.plan,
    trialEndsAt: org.trial_ends_at,
    accessEndsAt: org.canceled_access_ends_at,
    timeZone: coerceTimeZone(org.timezone),
  };
}

export function useTrialStatus(): TrialStatus & { isLoading: boolean } {
  const status = useTrialStatusInner();
  const readOnly = status.isReadOnly || status.isExpired;
  useEffect(() => {
    setOrgReadOnlyForErrors(readOnly);
  }, [readOnly]);
  return status;
}

function readOnlyWindow(
  reason: "trial" | "canceled",
  accessEndsAt: string | null
): Omit<TrialStatus, "isTrial" | "trialEndsAt"> {
  // A missing end date is treated as already ended rather than open-ended.
  const msLeft = accessEndsAt ? new Date(accessEndsAt).getTime() - Date.now() : 0;
  const ended = msLeft <= 0;
  return {
    isExpired: ended,
    lockReason: ended ? reason : null,
    daysRemaining: Math.max(0, Math.ceil(msLeft / DAY_MS)),
    isReadOnly: !ended,
    readOnlyReason: ended ? null : reason,
    accessEndsAt,
  };
}

function useTrialStatusInner(): TrialStatus & { isLoading: boolean } {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["org-trial-status"],
    queryFn: () => fetchTrialStatus(queryClient),
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading || data == null) {
    return {
      isTrial: false, isExpired: false, lockReason: null, trialEndsAt: null, daysRemaining: 0,
      isReadOnly: false, readOnlyReason: null, accessEndsAt: null, isLoading: true,
    };
  }

  if (data.plan === "canceled") {
    // Read-only until accessEndsAt (set by the billing webhook), then locked out.
    return { isTrial: false, trialEndsAt: null, ...readOnlyWindow("canceled", data.accessEndsAt), isLoading: false };
  }

  const isTrial = data.plan === "trial";
  const trialEndsAt = data.trialEndsAt;
  // Open-ended trial (no end date, e.g. the platform's own org): nothing to count down.
  if (!isTrial || trialEndsAt == null) {
    return {
      isTrial, isExpired: false, lockReason: null, trialEndsAt, daysRemaining: 0,
      isReadOnly: false, readOnlyReason: null, accessEndsAt: null, isLoading: false,
    };
  }

  const endMs = new Date(trialEndsAt).getTime();
  if (endMs <= Date.now()) {
    // Ended trial: read-only for 90 days after it ended, then locked — the
    // same window a canceled subscription gets.
    const accessEndsAt = new Date(endMs + READ_ONLY_ACCESS_DAYS * DAY_MS).toISOString();
    return { isTrial, trialEndsAt, ...readOnlyWindow("trial", accessEndsAt), isLoading: false };
  }

  // Count calendar days on the org's clock: a trial ending at the end of
  // Dec 11 shows "30 days left" on Nov 11 and "ends today" on Dec 11.
  const daysRemaining = Math.max(
    0,
    daysBetweenYmd(todayInZone(data.timeZone), isoInZone(new Date(endMs), data.timeZone))
  );
  return {
    isTrial, isExpired: false, lockReason: null, trialEndsAt, daysRemaining,
    isReadOnly: false, readOnlyReason: null, accessEndsAt: null, isLoading: false,
  };
}
