import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface QboCustomerCandidate {
  id: string;
  displayName: string;
}

export type QuickBooksClientSyncResult =
  | { status: "linked"; qboCustomerId: string }
  | { status: "ambiguous"; candidates: QboCustomerCandidate[] };

export function useQuickBooksClientLink(clientId: string) {
  return useQuery<{ qboCustomerId: string | null }>({
    queryKey: ["quickbooks", "client-link", clientId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/clients/${clientId}/quickbooks-sync`);
      if (!res.ok) throw new Error("Failed to load QuickBooks link status");
      return res.json();
    },
  });
}

export function useSyncClientToQuickBooks(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      opts?: { qboCustomerId?: string; forceCreate?: boolean }
    ): Promise<QuickBooksClientSyncResult> => {
      const res = await fetch(`/api/crm/clients/${clientId}/quickbooks-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts ?? {}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to sync with QuickBooks");
      }
      return res.json();
    },
    onSuccess: (result) => {
      if (result.status === "linked") {
        qc.invalidateQueries({ queryKey: ["quickbooks", "client-link", clientId] });
      }
    },
  });
}
