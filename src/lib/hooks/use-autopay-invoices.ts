import { useMutation, useQueryClient } from "@tanstack/react-query";

/** Thrown when the server refuses a charge because one covering the same
 * invoice is already in flight. Carries its own type so a bulk run can report
 * "already in progress" separately from a genuine failure — an ACH debit stays
 * in flight for days, so a daily pass over the ACH queue hits this for every
 * debit still settling, and calling those "failed" would be actively
 * misleading. */
export class DuplicateChargeError extends Error {
  /** True when the existing charge is a bank debit still settling. */
  readonly inFlight: boolean;
  constructor(message: string, inFlight: boolean) {
    super(message);
    this.name = "DuplicateChargeError";
    this.inFlight = inFlight;
  }
}

export interface ChargeAutopayInvoiceResult {
  status: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
  clientId: string;
  paymentIntentId?: string;
  /** False when the charge succeeded at Stripe but the payment could NOT be
   * written to the ledger (or, harmlessly, when an ACH debit is still
   * `processing` and the webhook will record it on settlement). Callers must
   * surface the first case — the customer has been debited. */
  recorded?: boolean;
  recordingError?: string | null;
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
      if (!res.ok) {
        if (res.status === 409 && body.code === "duplicate_charge") {
          throw new DuplicateChargeError(body.error ?? "A charge for this invoice is already in progress", Boolean(body.inFlight));
        }
        throw new Error(body.error ?? "Failed to charge invoice");
      }
      return body as ChargeAutopayInvoiceResult;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["crm-invoices"] });
      // The payment list is a SEPARATE query from the invoice list. Without
      // this, a charge landed in the DB but the client's Accounting box and
      // the Payments page kept showing stale rows until a hard reload — while
      // the invoice's own Payment History (nested in the invoice query, which
      // IS invalidated here) showed it immediately.
      qc.invalidateQueries({ queryKey: ["crm-payments"] });
      qc.invalidateQueries({ queryKey: ["clients", data.clientId] });
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}
