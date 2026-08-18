import { useMutation } from "@tanstack/react-query";

export interface CreateSetupIntentResult {
  clientSecret: string;
  connectedAccountId: string;
}

export interface SavedPaymentMethodResult {
  type: "card" | "us_bank_account";
  summary: string;
}

export function useCreatePortalSetupIntent() {
  return useMutation({
    mutationFn: async ({ paymentMethod }: { paymentMethod: "card" | "us_bank_account" }) => {
      const res = await fetch("/api/portal/payments/connect/setup-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentMethod }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start payment method setup");
      return body as CreateSetupIntentResult;
    },
  });
}

export function useSavePortalSetupIntent() {
  return useMutation({
    mutationFn: async ({ setupIntentId }: { setupIntentId: string }) => {
      const res = await fetch("/api/portal/payments/connect/setup-intent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupIntentId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to save payment method");
      return body as SavedPaymentMethodResult;
    },
  });
}

export function useRemovePortalPaymentMethod() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/portal/payments/connect/payment-method", { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to remove payment method");
      return body as { removed: true };
    },
  });
}
