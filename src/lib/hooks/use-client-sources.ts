"use client";

import { useOrgList } from "@/lib/hooks/use-org-lists";

/**
 * Fallback lead/client source list used when the org hasn't defined any
 * sources under Settings → Lists (crm_list_options.list_name = 'client_sources').
 * Both the New Lead dialog and the Edit Client → Details "Source" select read
 * from useClientSourceOptions so the two dropdowns can never drift apart.
 */
export const DEFAULT_CLIENT_SOURCES = [
  "Referral", "Google", "Facebook", "Door Hanger", "Yard Sign",
  "Direct Mail", "Website", "Phone Call", "Other",
];

/**
 * Org-level source options, falling back to DEFAULT_CLIENT_SOURCES once the
 * org list has loaded and turned out to be empty. Pass `current` (the value
 * already stored on the record being edited) so a legacy/free-text value that
 * isn't in the list still appears as a selectable option instead of the
 * Select silently showing blank.
 */
export function useClientSourceOptions(current?: string | null): { options: string[]; isLoading: boolean } {
  const { data, isLoading } = useOrgList("client_sources");
  const orgValues = (data ?? []).map((o) => o.value);
  const base = !isLoading && orgValues.length === 0 ? DEFAULT_CLIENT_SOURCES : orgValues;
  const options = current && current.trim() && !base.includes(current) ? [...base, current] : base;
  return { options, isLoading };
}
