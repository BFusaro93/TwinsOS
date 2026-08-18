import { useMutation, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", user.id)
        .single();
      if (profileErr) throw profileErr;

      const { data, error } = await supabase
        .from("organizations")
        .select("stripe_connect_status, stripe_connect_charges_enabled, stripe_connect_payouts_enabled")
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;

      return {
        status: data.stripe_connect_status as ConnectStatus["status"],
        chargesEnabled: data.stripe_connect_charges_enabled,
        payoutsEnabled: data.stripe_connect_payouts_enabled,
      };
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
