"use client";

import { useOrgList } from "@/lib/hooks/use-org-lists";

/** Reasons the cancel dialogs always offer, whatever the org has added under Settings → Lists. */
export const BUILTIN_CANCELLATION_REASONS = ["Price", "Moved", "Unhappy with service", "No longer needs service"];

/** Built-in reasons plus the org's own list (deduplicated), so automation conditions can match
 *  what the cancel dialogs actually store — in a new org the org list is empty. */
export function useCancellationReasonOptions(): string[] {
  const { data } = useOrgList("cancellation_reasons");
  const org = (data ?? []).map((o) => o.value);
  return [...BUILTIN_CANCELLATION_REASONS, ...org.filter((r) => !BUILTIN_CANCELLATION_REASONS.includes(r)), "Other"];
}
