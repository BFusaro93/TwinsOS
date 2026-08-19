import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { BillablePlan } from "@/lib/stripe/plans";
import { getSeatConfig } from "@/lib/stripe/plans";
import type { BillingPlanInfo, BillingAddonInfo } from "@/app/api/billing/plans/route";

export interface BillingInfo {
  plan: string;
  stripeSubscriptionStatus: string | null;
  hasStripeCustomer: boolean;
  billingInterval: string;
  trialEndsAt: string | null;
  seatsIncluded: number;
  seatOverageCents: number;
  seatsUsed: number;
  enabledAddons: string[];
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
        .select(
          "plan, stripe_subscription_status, stripe_customer_id, billing_interval, trial_ends_at, seats_included_override, seat_overage_cents_override"
        )
        .eq("id", profile.org_id)
        .single();
      if (error) throw error;

      // Crew accounts (profiles.role === "crew") are shared field-clock-in
      // logins, not real named seats — same distinction (dashboard)/layout.tsx
      // already draws when confining them to /crm/crew — so they don't count
      // toward the plan's seat limit or its overage billing.
      const { count: seatsUsed } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("org_id", profile.org_id)
        .neq("status", "inactive")
        .neq("role", "crew");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addonRows = await (supabase as any)
        .from("organization_addons")
        .select("addon_key")
        .eq("org_id", profile.org_id)
        .eq("enabled", true);

      const { seatsIncluded, seatOverageCents } = getSeatConfig(data.plan, {
        seatsIncludedOverride: data.seats_included_override,
        seatOverageCentsOverride: data.seat_overage_cents_override,
      });

      return {
        plan: data.plan,
        stripeSubscriptionStatus: data.stripe_subscription_status,
        hasStripeCustomer: Boolean(data.stripe_customer_id),
        billingInterval: data.billing_interval,
        trialEndsAt: data.trial_ends_at,
        seatsIncluded,
        seatOverageCents,
        seatsUsed: seatsUsed ?? 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        enabledAddons: (addonRows.data ?? []).map((r: any) => r.addon_key),
      };
    },
  });
}

export function usePlans() {
  return useQuery<{ stripeEnabled: boolean; plans: BillingPlanInfo[]; addons: BillingAddonInfo[] }>({
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan: BillablePlan) => {
      const res = await fetch("/api/billing/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to start checkout");
      // { updated: true } — org already had a live subscription; its price
      // was changed in place instead of opening a new checkout session.
      return body as { clientSecret: string } | { updated: true };
    },
    onSuccess: (result) => {
      if ("updated" in result) {
        queryClient.invalidateQueries({ queryKey: ["billing-info"] });
      }
    },
  });
}

export function useToggleAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ addon, enabled }: { addon: string; enabled: boolean }) => {
      const res = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addon, enabled }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update add-on");
      return body as { enabled: boolean; bundled: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-info"] });
    },
  });
}

export interface SmsUsage {
  count: number;
  overageBilledCents: number;
}

export function useSmsUsage(enabled: boolean) {
  return useQuery<SmsUsage | null>({
    queryKey: ["sms-usage"],
    enabled,
    queryFn: async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase.from("profiles").select("org_id").eq("id", user.id).single();
      if (!profile) return null;

      const periodStart = new Date();
      periodStart.setUTCDate(1);
      const periodStartStr = periodStart.toISOString().slice(0, 10);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("organization_sms_usage")
        .select("count, overage_billed_cents")
        .eq("org_id", profile.org_id)
        .eq("period_start", periodStartStr)
        .maybeSingle();

      return { count: data?.count ?? 0, overageBilledCents: data?.overage_billed_cents ?? 0 };
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
