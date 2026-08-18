import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface CreateSetupIntentResult {
  clientSecret: string;
  connectedAccountId: string;
}

export interface SavedPaymentMethodResult {
  type: "card" | "us_bank_account";
  summary: string;
}

export function useCreateSetupIntent() {
  return useMutation({
    mutationFn: async ({
      clientId,
      paymentMethod,
    }: {
      clientId: string;
      paymentMethod: "card" | "us_bank_account";
    }) => {
      const res = await fetch("/api/crm/payments/connect/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, paymentMethod }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start payment method setup");
      return body as CreateSetupIntentResult;
    },
  });
}

export function useSaveSetupIntent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, setupIntentId }: { clientId: string; setupIntentId: string }) => {
      const res = await fetch("/api/crm/payments/connect/setup-intent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, setupIntentId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save payment method");
      return body as SavedPaymentMethodResult;
    },
    onSuccess: (_result, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useRemoveSavedPaymentMethod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId }: { clientId: string }) => {
      const res = await fetch("/api/crm/payments/connect/payment-method", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove payment method");
      return body as { removed: true };
    },
    onSuccess: (_result, { clientId }) => {
      qc.invalidateQueries({ queryKey: ["clients", clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
