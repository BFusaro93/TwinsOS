import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface ChargeAutopayInvoiceResult {
  status: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

/** Charges an invoice's balance against its client's saved payment method (card or
 * ACH) — powers the "To Charge" / "ACH To Charge" tabs on the Invoices list. Manual
 * only: staff pick invoices and hit Charge, there's no automatic background job. */
export function useChargeAutopayInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId }: { invoiceId: string }) => {
      const res = await fetch("/api/crm/payments/autopay/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to charge invoice");
      return body as ChargeAutopayInvoiceResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
    },
  });
}
