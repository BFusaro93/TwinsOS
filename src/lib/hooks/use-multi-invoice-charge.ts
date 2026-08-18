import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface MultiChargeAllocation {
  invoiceId: string;
  amountCents: number;
}

export interface CreateMultiPaymentIntentResult {
  clientSecret: string;
  connectedAccountId: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

/** Fresh card/bank entry, charged once and split across multiple invoices — the multi-invoice
 * counterpart to useCreateCrmPaymentIntent in use-crm-card-payments.ts. */
export function useCreateMultiPaymentIntent() {
  return useMutation({
    mutationFn: async ({
      clientId,
      allocations,
      waiveFee,
      overrideFeeCents,
      paymentMethod,
    }: {
      clientId: string;
      allocations: MultiChargeAllocation[];
      waiveFee?: boolean;
      overrideFeeCents?: number;
      paymentMethod: "card" | "us_bank_account";
    }) => {
      const res = await fetch("/api/crm/payments/create-intent-multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, allocations, waiveFee, overrideFeeCents, paymentMethod }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start payment");
      return body as CreateMultiPaymentIntentResult;
    },
  });
}

export interface ChargeMultiResult {
  status: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

/** Charges the client's saved payment method once for a combined total split across multiple
 * invoices — the multi-invoice counterpart to useChargeAutopayInvoice in use-autopay-invoices.ts. */
export function useChargeMultiSaved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, allocations }: { clientId: string; allocations: MultiChargeAllocation[] }) => {
      const res = await fetch("/api/crm/payments/autopay/charge-multi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, allocations }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to charge saved payment method");
      return body as ChargeMultiResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}
