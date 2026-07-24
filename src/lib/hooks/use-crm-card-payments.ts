import { useMutation } from "@tanstack/react-query";

export interface CreatePaymentIntentResult {
  clientSecret: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

export function useCreateCrmPaymentIntent() {
  return useMutation({
    mutationFn: async ({ invoiceId, waiveFee }: { invoiceId: string; waiveFee?: boolean }) => {
      const res = await fetch("/api/crm/payments/create-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, waiveFee }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start card payment");
      return body as CreatePaymentIntentResult;
    },
  });
}
