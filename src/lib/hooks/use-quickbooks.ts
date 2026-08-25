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

// ── Phase 4: reconciliation / sync status ───────────────────────────────────

export interface QuickBooksFailedInvoice {
  id: string;
  invoiceNumber: number | null;
  clientName: string | null;
  error: string;
  attemptedAt: string | null;
}

export interface QuickBooksFailedPayment {
  allocationId: string;
  paymentId: string;
  invoiceNumber: number | null;
  clientName: string | null;
  amountCents: number;
  error: string;
  attemptedAt: string | null;
}

export interface QuickBooksSyncStatus {
  connected: boolean;
  lastSyncStatus: "ok" | "error" | "partial" | null;
  lastSyncAt: string | null;
  failedInvoices: QuickBooksFailedInvoice[];
  failedPayments: QuickBooksFailedPayment[];
}

export function useQuickBooksSyncStatus() {
  return useQuery<QuickBooksSyncStatus>({
    queryKey: ["quickbooks", "sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/integrations/quickbooks/sync-status");
      if (!res.ok) throw new Error("Failed to load QuickBooks sync status");
      return res.json();
    },
  });
}

export function useRetryQuickBooksInvoiceSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch(`/api/crm/invoices/${invoiceId}/quickbooks-sync`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry invoice sync");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quickbooks", "sync-status"] }),
  });
}

export function useRetryQuickBooksPaymentSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await fetch(`/api/crm/payments/${paymentId}/quickbooks-sync`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to retry payment sync");
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quickbooks", "sync-status"] }),
  });
}
