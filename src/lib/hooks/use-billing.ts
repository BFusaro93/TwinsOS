import { useQuery, useMutation } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { BillablePlan } from "@/lib/stripe/plans";
import type { BillingPlanInfo } from "@/app/api/billing/plans/route";

export interface BillingInfo {
  plan: string;
  stripeSubscriptionStatus: string | null;
  hasStripeCustomer: boolean;
}

export function useBillingInfo() {
  return useQuery<BillingInfo>({
    queryKey: ["billing-info"],
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
        .select("plan, stripe_subscription_status, stripe_customer_id")
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;

      return {
        plan: data.plan,
        stripeSubscriptionStatus: data.stripe_subscription_status,
        hasStripeCustomer: Boolean(data.stripe_customer_id),
      };
    },
  });
}

export function usePlans() {
  return useQuery<{ stripeEnabled: boolean; plans: BillingPlanInfo[] }>({
    queryKey: ["billing-plans"],
    queryFn: async () => {
      const res = await fetch("/api/billing/plans");
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load plans");
      return body;
    },
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: async (plan: BillablePlan) => {
      const res = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start checkout");
      return body as { clientSecret: string };
    },
  });
}

export function useCreatePortalSession() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/billing/portal-session", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to open billing portal");
      return body as { url: string };
    },
  });
}
