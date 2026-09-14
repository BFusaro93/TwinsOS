import { useMutation, useQuery } from "@tanstack/react-query";

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
