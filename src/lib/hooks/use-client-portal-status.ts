"use client";

import { useQuery } from "@tanstack/react-query";
import type { ClientPortalStatusResponse } from "@/app/api/crm/clients/[clientId]/portal-status/route";

export type { ClientPortalStatusResponse };

export const clientPortalStatusKey = (clientId: string) => ["clients", clientId, "portal-status"] as const;

/**
 * Office-side view of a client's portal access (none / invited / active with
 * last login) — see /api/crm/clients/[clientId]/portal-status.
 */
export function useClientPortalStatus(clientId: string | undefined) {
  return useQuery({
    queryKey: clientPortalStatusKey(clientId ?? ""),
    queryFn: async (): Promise<ClientPortalStatusResponse> => {
      const res = await fetch(`/api/crm/clients/${clientId}/portal-status`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Failed to load portal status");
      }
      return res.json() as Promise<ClientPortalStatusResponse>;
    },
    enabled: !!clientId,
  });
}
