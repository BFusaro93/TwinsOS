import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/hooks/use-query";
import type { ImportPreviewRow } from "@/lib/stripe/import-saved-methods";
import { invalidateClientBalances } from "@/lib/hooks/client-balance-invalidation";

export interface CreatePaymentIntentResult {
  clientSecret: string;
  connectedAccountId: string;
  /** false = this client_secret was minted with the org's Stripe TEST key —
   * confirm it with the matching test-mode publishable key (see
   * getScopedStripeJs in src/lib/stripe/client.ts). */
  livemode: boolean;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

export interface ConnectStatus {
  status: "not_started" | "pending" | "active" | "restricted";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  /** false = this org's Stripe Connect account is a Stripe TEST-mode account
   * (e.g. the dogfood/sandbox org) — no real money moves through it. Absent/
   * null/true = live mode (the normal case). */
  livemode?: boolean | null;
}

export function useConnectStatus() {
  return useQuery<ConnectStatus>({
    queryKey: ["stripe-connect-status"],
    queryFn: async () => {
      const res = await fetch("/api/crm/payments/connect/status");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load payment connection status");
      return body as ConnectStatus;
    },
  });
}

export function useStartConnectOnboarding() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crm/payments/connect/onboarding", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start Stripe onboarding");
      return body as { url: string };
    },
  });
}

export function useStartConnectOAuth() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crm/payments/connect/oauth/start", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start Stripe connection");
      return body as { url: string };
    },
  });
}

export interface SavedMethodImportPreview {
  rows: ImportPreviewRow[];
  totalCustomers: number;
  customersWithoutMethod: number;
  truncated: boolean;
}

/** Links per import request — the route allows 1,000; smaller batches keep each request well inside its time limit. */
const IMPORT_BATCH = 500;

export interface SavedMethodImportResult {
  imported: number;
  failed: Array<{ customerId: string; clientId: string; error?: string }>;
  autopayEnabled: boolean;
}

/** Dry run — reads the connected Stripe account and matches customers to clients; writes nothing. */
export function usePreviewSavedMethodImport() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/crm/payments/connect/import-methods");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to read saved payment methods from Stripe");
      return body as SavedMethodImportPreview;
    },
  });
}

export function useApplySavedMethodImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { links: Array<{ customerId: string; clientId: string }>; enableAutopay: boolean }) => {
      // The route caps a request at 1,000 links and each link is a Stripe round trip, so a
      // large import goes in batches; results are combined so the caller sees one total.
      const total: SavedMethodImportResult = { imported: 0, failed: [], autopayEnabled: input.enableAutopay };
      for (let i = 0; i < input.links.length; i += IMPORT_BATCH) {
        const res = await fetch("/api/crm/payments/connect/import-methods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links: input.links.slice(i, i + IMPORT_BATCH), enableAutopay: input.enableAutopay }),
        });
        const body = await res.json();
        if (!res.ok) {
          const msg = typeof body.error === "string" ? body.error : "Failed to import payment methods";
          // Earlier batches are already saved — say so rather than reporting the whole import as failed.
          throw new Error(total.imported > 0 ? `${msg} (${total.imported} imported before this)` : msg);
        }
        const part = body as SavedMethodImportResult;
        total.imported += part.imported;
        total.failed.push(...part.failed);
        total.autopayEnabled = part.autopayEnabled;
      }
      return total;
    },
    onSuccess: () => {
      invalidateClientBalances(qc);
    },
  });
}

export function useCreateCrmPaymentIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      invoiceId,
      waiveFee,
      overrideFeeCents,
      paymentMethod,
    }: {
      invoiceId: string;
      waiveFee?: boolean;
      overrideFeeCents?: number;
      paymentMethod: "card" | "us_bank_account";
    }) => {
      const res = await fetch("/api/crm/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, waiveFee, overrideFeeCents, paymentMethod }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start payment");
      return body as CreatePaymentIntentResult;
    },
    // The route applies the client's existing credit BEFORE it can fail or
    // return "nothing to charge", so invoices may have changed either way.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      invalidateClientBalances(qc);
    },
  });
}
