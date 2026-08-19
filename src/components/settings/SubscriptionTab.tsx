"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { CreditCard, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useBillingInfo,
  usePlans,
  useCreateCheckoutSession,
  useCreatePortalSession,
  useToggleAddon,
  useSmsUsage,
} from "@/lib/hooks/use-billing";
import type { BillablePlan } from "@/lib/stripe/plans";
import { getHighlightsForPlan } from "@/lib/stripe/plan-features";
import { isBillablePlan } from "@/lib/stripe/plans";
import { PlanComparisonTable } from "./PlanComparisonTable";

const ACTIVE_STATUSES = new Set(["trialing", "active", "past_due"]);

let stripeJsPromise: Promise<StripeJs | null> | null = null;
function getStripeJs(): Promise<StripeJs | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!stripeJsPromise) stripeJsPromise = loadStripe(key);
  return stripeJsPromise;
}

function formatPrice(amountCents: number | null, currency: string | null, interval: string | null): string | null {
  if (amountCents == null || !currency) return null;
  const amount = (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  return interval ? `${amount}/${interval}` : amount;
}

export function SubscriptionTab() {
  const searchParams = useSearchParams();
  const { data: billing, isLoading: billingLoading } = useBillingInfo();
  const { data: plansData, isLoading: plansLoading } = usePlans();
  const createCheckoutSession = useCreateCheckoutSession();
  const createPortalSession = useCreatePortalSession();
  const toggleAddon = useToggleAddon();
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [addonError, setAddonError] = useState<string | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const autoSubscribeTriggered = useRef(false);

  const isActiveSubscriber = ACTIVE_STATUSES.has(billing?.stripeSubscriptionStatus ?? "");
  const smsEnabled = billing?.enabledAddons.includes("sms") ?? false;
  const { data: smsUsage } = useSmsUsage(smsEnabled);

  async function handleToggleAddon(addon: string, enabled: boolean) {
    setAddonError(null);
    try {
      await toggleAddon.mutateAsync({ addon, enabled });
      toast.success(enabled ? "Add-on enabled" : "Add-on removed");
    } catch (err) {
      setAddonError(err instanceof Error ? err.message : "Failed to update add-on");
    }
  }

  async function handleSubscribe(plan: BillablePlan) {
    setCheckoutError(null);
    const stripeJs = getStripeJs();
    if (!stripeJs) {
      setCheckoutError("Stripe publishable key is not configured yet.");
      return;
    }
    try {
      const result = await createCheckoutSession.mutateAsync(plan);
      if ("updated" in result) {
        // Already had a live subscription — its price was changed in place,
        // no checkout needed.
        toast.success("Plan updated");
        return;
      }
      setCheckoutClientSecret(result.clientSecret);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Failed to start checkout");
    }
  }

  // Landed here via the signup plan picker (organizations.pending_plan) —
  // open checkout for the chosen plan automatically, once, as soon as the
  // live plan catalog is loaded.
  useEffect(() => {
    const autoSubscribe = searchParams.get("autoSubscribe");
    if (
      !autoSubscribeTriggered.current &&
      autoSubscribe &&
      isBillablePlan(autoSubscribe) &&
      plansData?.stripeEnabled
    ) {
      autoSubscribeTriggered.current = true;
      handleSubscribe(autoSubscribe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, plansData?.stripeEnabled]);

  async function handleManageBilling() {
    try {
      const { url } = await createPortalSession.mutateAsync();
      window.location.href = url;
    } catch {
      // surfaced via createPortalSession.error below
    }
  }

  if (billingLoading || plansLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!plansData?.stripeEnabled) {
    return (
      <div className="rounded-lg border border-brand-100 bg-brand-50 p-5">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
          <div>
            <p className="text-sm font-semibold text-brand-800">Billing isn&apos;t connected yet</p>
            <p className="mt-0.5 text-xs text-brand-600">
              Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, and
              the STRIPE_PRICE_* variables to enable subscriptions. See .env.local.example.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Current plan */}
      <div className="rounded-lg border bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-6 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Current Plan
            </p>
            <h2 className="text-2xl font-bold capitalize text-slate-900">{billing?.plan ?? "trial"}</h2>
            {billing?.stripeSubscriptionStatus && (
              <p className="mt-1 text-sm text-slate-500">
                Status:{" "}
                <span className="font-semibold capitalize text-slate-700">
                  {billing.stripeSubscriptionStatus.replace("_", " ")}
                </span>
              </p>
            )}
            {billing && (
              <p className="mt-1 text-sm text-slate-500">
                Seats: <span className="font-semibold text-slate-700">{billing.seatsUsed}</span> of{" "}
                {billing.seatsIncluded} included
                {billing.seatsUsed > billing.seatsIncluded && (
                  <span className="ml-1 text-amber-600">
                    (+{billing.seatsUsed - billing.seatsIncluded} over — billed at{" "}
                    {(billing.seatOverageCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}
                    /seat next cycle)
                  </span>
                )}
              </p>
            )}
            {billing?.plan === "trial" && billing.trialEndsAt && (
              <p className="mt-1 text-sm text-slate-500">
                Trial ends <span className="font-semibold text-slate-700">{new Date(billing.trialEndsAt).toLocaleDateString()}</span>
              </p>
            )}
          </div>
          {billing?.hasStripeCustomer && (
            <Button variant="outline" onClick={handleManageBilling} disabled={createPortalSession.isPending}>
              {createPortalSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Manage Billing
            </Button>
          )}
        </div>
        {createPortalSession.isError && (
          <p className="px-6 pb-4 text-sm text-red-600">{createPortalSession.error.message}</p>
        )}
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plansData.plans.map((p) => {
          const priceLabel = p.configured ? formatPrice(p.amountCents, p.currency, p.interval) ?? "Contact us" : "Not configured";
          const isCurrent = billing?.plan === p.plan && isActiveSubscriber;
          return (
            <div key={p.plan} className="flex flex-col rounded-lg border bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{p.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{priceLabel}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {getHighlightsForPlan(p.plan as BillablePlan).map((h) => (
                  <li key={h} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand-600" />
                    {h}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-400">
                +{(p.seatOverageCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })}/seat after included seats
              </p>
              <div className="mt-4 flex-1" />
              <Button
                className="mt-2 bg-brand-500 hover:bg-brand-600"
                disabled={!p.configured || isCurrent || createCheckoutSession.isPending}
                onClick={() => handleSubscribe(p.plan as BillablePlan)}
              >
                {isCurrent ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Current Plan
                  </>
                ) : createCheckoutSession.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Subscribe"
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {checkoutError && <p className="text-sm text-red-600">{checkoutError}</p>}

      <div>
        <button
          type="button"
          onClick={() => setShowComparison((v) => !v)}
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          {showComparison ? "Hide full plan comparison" : "Compare all plans in detail →"}
        </button>
        {showComparison && (
          <div className="mt-4">
            <PlanComparisonTable />
          </div>
        )}
      </div>

      {/* Add-ons */}
      <div className="rounded-lg border bg-white p-5 shadow-sm">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-400">Add-ons</p>
        <div className="flex flex-col divide-y divide-slate-100">
          {plansData.addons.map((a) => {
            const currentPlan = plansData.plans.find((p) => p.plan === billing?.plan);
            const bundled = currentPlan?.bundledAddons.includes(a.key) ?? false;
            const enabled = bundled || (billing?.enabledAddons.includes(a.key) ?? false);
            const priceLabel = a.configured ? formatPrice(a.amountCents, a.currency, a.interval) ?? "Contact us" : "Not configured";
            return (
              <div key={a.key} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{a.label}</p>
                  <p className="text-xs text-slate-500">
                    {bundled ? "Included in your plan" : priceLabel}
                    {a.metered && !bundled && " (500 messages included, then $10 per 250 over)"}
                  </p>
                  {a.key === "sms" && enabled && smsUsage && (
                    <p className="mt-1 text-xs text-slate-400">
                      {smsUsage.count.toLocaleString()} sent this period
                      {smsUsage.overageBilledCents > 0 &&
                        ` · ${(smsUsage.overageBilledCents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })} overage billed`}
                    </p>
                  )}
                </div>
                <Button
                  variant={enabled ? "outline" : "default"}
                  size="sm"
                  disabled={bundled || !a.configured || toggleAddon.isPending}
                  className={enabled ? "" : "bg-brand-500 hover:bg-brand-600"}
                  onClick={() => handleToggleAddon(a.key, !enabled)}
                >
                  {bundled ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      Included
                    </>
                  ) : enabled ? (
                    "Remove"
                  ) : (
                    "Add"
                  )}
                </Button>
              </div>
            );
          })}
        </div>
        {addonError && <p className="mt-3 text-sm text-red-600">{addonError}</p>}
      </div>

      <Dialog open={checkoutClientSecret != null} onOpenChange={(open) => !open && setCheckoutClientSecret(null)}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-6 pb-0">
            <DialogTitle>Subscribe</DialogTitle>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto p-6 pt-2">
            {checkoutClientSecret && (
              <EmbeddedCheckoutProvider stripe={getStripeJs()} options={{ clientSecret: checkoutClientSecret }}>
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
