"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";

/** Clients (not tax-exempt) still at `fromBps` — offered the new company rate after it's saved. */
export function useClientsAtTaxRate(fromBps: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ["clients-at-tax-rate", fromBps],
    enabled: enabled && fromBps != null,
    queryFn: async (): Promise<{ count: number; toBps: number }> => {
      const res = await fetch(`/api/crm/clients/apply-org-tax-rate?fromBps=${fromBps}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not count clients");
      return body as { count: number; toBps: number };
    },
    staleTime: 0,
  });
}

/** Moves every client still at `fromBps` to the company's current tax rate. Returns how many changed. */
export function useApplyOrgTaxRateToClients() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fromBps: number): Promise<number> => {
      const res = await fetch("/api/crm/clients/apply-org-tax-rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromBps }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Could not update clients");
      return Number(body?.updated ?? 0);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients-at-tax-rate"] });
    },
  });
}
