import { useMutation } from "@tanstack/react-query";

export interface CreatePaymentIntentResult {
  clientSecret: string;
  connectedAccountId: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

export function useCreatePortalPaymentIntent() {
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await fetch("/api/portal/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start card payment");
      return body as CreatePaymentIntentResult;
    },
  });
}
