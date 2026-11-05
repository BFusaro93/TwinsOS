import { useMutation } from "@tanstack/react-query";

export interface CreatePaymentIntentResult {
  clientSecret: string;
  connectedAccountId: string;
  livemode: boolean;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

export type PortalPaymentMethod = "card" | "us_bank_account";

async function post(url: string, body: unknown): Promise<CreatePaymentIntentResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "Failed to start payment");
  return json as CreatePaymentIntentResult;
}

/**
 * Starts a portal payment for one invoice, several invoices at once, or a
 * prepayment (no invoice). One invoice keeps the original single-invoice route;
 * more than one goes to the combined route, whose charge the webhook applies
 * across all of them.
 */
export function useCreatePortalPaymentIntent() {
  return useMutation({
    mutationFn: (
      args:
        | { invoiceIds: string[]; paymentMethod: PortalPaymentMethod }
        | { prepaymentCents: number; nonce: string; accountId?: string; paymentMethod: PortalPaymentMethod }
    ) => {
      if ("prepaymentCents" in args) {
        return post("/api/portal/payments/create-prepayment-intent", {
          amountCents: args.prepaymentCents,
          nonce: args.nonce,
          accountId: args.accountId,
          paymentMethod: args.paymentMethod,
        });
      }
      if (args.invoiceIds.length === 1) {
        return post("/api/portal/payments/create-intent", {
          invoiceId: args.invoiceIds[0],
          paymentMethod: args.paymentMethod,
        });
      }
      return post("/api/portal/payments/create-intent-multi", {
        invoiceIds: args.invoiceIds,
        paymentMethod: args.paymentMethod,
      });
    },
  });
}
