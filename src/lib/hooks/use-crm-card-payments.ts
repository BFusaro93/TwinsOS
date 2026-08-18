import { useMutation, useQuery } from "@tanstack/react-query";

export interface CreatePaymentIntentResult {
  clientSecret: string;
  connectedAccountId: string;
  balanceCents: number;
  feeCents: number;
  totalChargeCents: number;
}

export interface ConnectStatus {
  status: "not_started" | "pending" | "active" | "restricted";
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
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

export function useCreateCrmPaymentIntent() {
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
  });
}
