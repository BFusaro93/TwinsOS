"use client";

import { useQuery } from "@/lib/hooks/use-query";

export interface PortalVisitStatus {
  id: string;
  status: string;
}

/** How often an open portal page refreshes visit status (in-progress banner). */
const POLL_MS = 60_000;

/**
 * Current status of the given portal visits, polled while the page is open.
 * Portal users can't subscribe to crm_job_visits over Realtime (no RLS read
 * path), so /api/portal/visits/status answers for the login's own visits.
 */
export function usePortalVisitStatuses(visitIds: string[]) {
  const ids = [...new Set(visitIds)].sort().slice(0, 50);
  return useQuery({
    queryKey: ["portal-visit-statuses", ids.join(",")],
    enabled: ids.length > 0,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<PortalVisitStatus[]> => {
      const res = await fetch(`/api/portal/visits/status?ids=${encodeURIComponent(ids.join(","))}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load visit status");
      return (body.visits ?? []) as PortalVisitStatus[];
    },
  });
}
