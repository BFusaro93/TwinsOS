import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface QuickBooksStatus {
  connected: boolean;
  configured: boolean;
  companyName?: string;
  error?: string;
}

export function useQuickBooksStatus() {
  return useQuery<QuickBooksStatus>({
    queryKey: ["quickbooks", "status"],
    queryFn: async () => {
      const res = await fetch("/api/integrations/quickbooks/status");
      if (!res.ok) throw new Error("Failed to load QuickBooks status");
      return res.json();
    },
  });
}

export function useDisconnectQuickBooks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/quickbooks/disconnect", { method: "POST" });
      if (!res.ok) throw new Error("Failed to disconnect QuickBooks");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quickbooks", "status"] }),
  });
}
