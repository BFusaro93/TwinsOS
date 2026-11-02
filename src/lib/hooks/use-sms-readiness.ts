"use client";

import { useQuery } from "@/lib/hooks/use-query";

/** Whether the org has a text-message sender registered. `undefined` while loading. */
export function useSmsReadiness(enabled = true) {
  return useQuery({
    queryKey: ["sms-readiness"],
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<boolean> => {
      const res = await fetch("/api/crm/sms/readiness");
      if (!res.ok) return true; // never block the UI on a status check
      const body = (await res.json()) as { ready?: boolean };
      return body.ready !== false;
    },
  });
}

export const SMS_NOT_READY_MESSAGE =
  "Text messaging isn't set up for your company yet, so texts won't send until SMS registration is finished in Settings → Integrations.";
