"use client";

import { useTrialStatus } from "@/lib/hooks/use-trial-status";
import { AccessLockedScreen } from "@/components/shared/AccessLockedScreen";

/**
 * The expired-trial / ended-subscription lockout for shells without their own
 * (crm and dashboard check useTrialStatus inline). Settings stays ungated so
 * the org can still reach Subscription and resubscribe.
 */
export function TrialLockGate({ children }: { children: React.ReactNode }) {
  const { isExpired, lockReason, isLoading } = useTrialStatus();
  if (!isLoading && isExpired) return <AccessLockedScreen reason={lockReason ?? "trial"} />;
  return <>{children}</>;
}
