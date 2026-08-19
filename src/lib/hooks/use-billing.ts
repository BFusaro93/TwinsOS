import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { BillablePlan, Product } from "@/lib/stripe/plans";
import type { BillingPlanInfo } from "@/app/api/billing/plans/route";

export interface BillingInfo {
  plan: string;
  stripeSubscriptionStatus: string | null;
  hasStripeCustomer: boolean;
}

const PRODUCT_COLUMNS = {
  equipt: {
    plan: "equipt_plan",
    status: "equipt_stripe_subscription_status",
  },
  landscapt: {
    plan: "landscapt_plan",
    status: "landscapt_stripe_subscription_status",
  },
} as const;

export function useBillingInfo(product: Product) {
  return useQuery<BillingInfo>({
    queryKey: ["billing-info", product],
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

      const cols = PRODUCT_COLUMNS[product];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("organizations")
        .select(`${cols.plan}, ${cols.status}, stripe_customer_id`)
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;

      return {
        plan: data[cols.plan],
        stripeSubscriptionStatus: data[cols.status],
        hasStripeCustomer: Boolean(data.stripe_customer_id),
      };
    },
  });
}

export function usePlans(product: Product) {
  return useQuery<{ stripeEnabled: boolean; plans: BillingPlanInfo[] }>({
    queryKey: ["billing-plans", product],
    queryFn: async () => {
      const res = await fetch(`/api/billing/plans?product=${product}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to load plans");
      return body;
    },
  });
}

export function useCreateCheckoutSession(product: Product) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: BillablePlan) => {
      const res = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product, plan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start checkout");
      // { updated: true } — org already had a live subscription; its price
      // was changed in place instead of opening a new checkout session.
      return body as { clientSecret: string } | { updated: true };
    },
    onSuccess: (result) => {
      if ("updated" in result) {
        queryClient.invalidateQueries({ queryKey: ["billing-info", product] });
      }
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
