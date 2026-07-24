"use client";

import { useState } from "react";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { CreditCard, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useBillingInfo,
  usePlans,
  useCreateCheckoutSession,
  useCreatePortalSession,
} from "@/lib/hooks/use-billing";
import type { BillablePlan } from "@/lib/stripe/plans";

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
  const { data: billing, isLoading: billingLoading } = useBillingInfo();
  const { data: plansData, isLoading: plansLoading } = usePlans();
  const createCheckoutSession = useCreateCheckoutSession();
  const createPortalSession = useCreatePortalSession();
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const isActiveSubscriber = ACTIVE_STATUSES.has(billing?.stripeSubscriptionStatus ?? "");

  async function handleSubscribe(plan: BillablePlan) {
    setCheckoutError(null);
    const stripeJs = getStripeJs();
    if (!stripeJs) {
      setCheckoutError("Stripe publishable key is not configured yet.");
      return;
    }
    try {
      const { clientSecret } = await createCheckoutSession.mutateAsync(plan);
      setCheckoutClientSecret(clientSecret);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Failed to start checkout");
    }
  }

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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plansData.plans.map((p) => {
          const priceLabel = p.configured ? formatPrice(p.amountCents, p.currency, p.interval) ?? "Contact us" : "Not configured";
          const isCurrent = billing?.plan === p.plan && isActiveSubscriber;
          return (
            <div key={p.plan} className="flex flex-col rounded-lg border bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{p.label}</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{priceLabel}</p>
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
