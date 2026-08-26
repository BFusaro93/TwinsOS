"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BILLABLE_PLANS, type BillablePlan } from "@/lib/stripe/plans";
import { getHighlightsForPlan } from "@/lib/stripe/plan-features";
import type { BillingPlanInfo } from "@/app/api/billing/plans/route";

function formatPrice(amountCents: number | null, currency: string | null, interval: string | null): string | null {
  if (amountCents == null || !currency) return null;
  const amount = (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  });
  return interval ? `${amount}/${interval}` : amount;
}

const FALLBACK_PLANS: BillingPlanInfo[] = BILLABLE_PLANS.map((p) => ({
  plan: p.plan,
  label: p.label,
  configured: false,
  priceId: null,
  amountCents: null,
  currency: null,
  interval: null,
  modules: p.modules as string[],
  seatsIncluded: p.seatsIncluded,
  seatOverageCents: p.seatOverageCents,
  bundledAddons: p.bundledAddons as string[],
}));

const MODULE_LABEL: Record<string, string> = {
  landscapt: "Landscapt",
  equipt: "Equipt",
};

export function PricingSection({ showHeader = true }: { showHeader?: boolean }) {
  const [plans, setPlans] = useState<BillingPlanInfo[]>(FALLBACK_PLANS);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((res) => res.json())
      .then((body) => {
        if (body.stripeEnabled && Array.isArray(body.plans)) setPlans(body.plans);
      })
      .catch(() => {
        // Live pricing is a nice-to-have here — the fallback cards below still
        // convey plan structure with a "Contact us" price.
      });
  }, []);

  return (
    <div id="pricing" className="mx-auto max-w-[1160px] px-6 py-24 sm:px-12">
      {showHeader && (
        <div className="mb-14 text-center">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-brand-600">Pricing</div>
          <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
            One flat monthly rate. Every plan starts with a 30-day free trial.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15px] text-slate-500">
            No credit card required to try it. Field crew logins are unlimited and never count toward your seats.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const priceLabel = p.configured ? formatPrice(p.amountCents, p.currency, p.interval) : null;
          const highlights = getHighlightsForPlan(p.plan as BillablePlan).slice(0, 6);
          const featured = p.plan === "growth";
          return (
            <div
              key={p.plan}
              className={`flex flex-col rounded-xl border p-6 ${
                featured ? "border-2 border-[#60ab45] bg-white shadow-lg" : "border-[#e6e6e0] bg-white"
              }`}
            >
              {featured && (
                <div className="mb-3 inline-flex w-fit items-center rounded-full bg-[#eef4e2] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#4a6b1a]">
                  Most popular
                </div>
              )}
              <div className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[#0a0a0a]">{p.label}</div>
              <div className="mt-1 flex gap-1.5">
                {p.modules.map((m) => (
                  <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">
                    {MODULE_LABEL[m] ?? m}
                  </span>
                ))}
              </div>
              <div className="mt-4 text-2xl font-extrabold text-[#0a0a0a]">{priceLabel ?? "Contact us"}</div>
              <div className="mt-0.5 text-xs text-slate-500">{p.seatsIncluded} office/admin seats included</div>
              <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                {highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-[13px] leading-snug text-slate-600">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#60ab45]" />
                    {h}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className={`mt-6 w-full ${featured ? "bg-[#60ab45] hover:bg-[#4a8a33]" : ""}`}
                variant={featured ? "default" : "outline"}
              >
                <Link href="/signup">Start free trial</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
