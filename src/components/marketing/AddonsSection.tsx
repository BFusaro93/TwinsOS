"use client";

import { useEffect, useState } from "react";
import { Camera, Users, Route, BarChart3, Code2, MessageSquareText } from "lucide-react";
import { ADDON_CATALOG, type AddonKey } from "@/lib/stripe/addons";
import { BILLABLE_PLANS } from "@/lib/stripe/plans";
import type { BillingAddonInfo } from "@/app/api/billing/plans/route";

const ICONS: Record<AddonKey, React.ComponentType<{ className?: string }>> = {
  sms: MessageSquareText,
  job_photos: Camera,
  client_portal: Users,
  route_optimization: Route,
  advanced_reporting: BarChart3,
  api_access: Code2,
};

const DESCRIPTIONS: Record<AddonKey, string> = {
  sms: "Text credits for automations, appointment reminders, and two-way client texting. Metered — pay only for what you send.",
  job_photos: "Before/after photo capture with annotations, tagging, and an archive workflow attached to every job.",
  client_portal: "A self-service portal where clients view estimates, pay invoices, and submit tickets without calling in.",
  route_optimization: "Automatically sequence today's stops to minimize drive time between jobs and service calls.",
  advanced_reporting: "Deeper financial and job-costing analytics beyond the standard report library.",
  api_access: "Programmatic REST API access to your data for custom integrations and internal tooling.",
};

function formatPrice(amountCents: number | null, currency: string | null, interval: string | null): string | null {
  if (amountCents == null || !currency) return null;
  const amount = (amountCents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  });
  return interval ? `${amount}/${interval}` : amount;
}

function bundledOn(key: AddonKey): string[] {
  return BILLABLE_PLANS.filter((p) => (p.bundledAddons as readonly string[]).includes(key)).map((p) => p.label);
}

const MODULE_LABEL: Record<string, string> = { landscapt: "Landscapt", equipt: "Equipt" };

function moduleTag(modules: string[]): string {
  if (modules.length > 1) return "Both products";
  return `${MODULE_LABEL[modules[0]] ?? modules[0]} only`;
}

const FALLBACK: BillingAddonInfo[] = ADDON_CATALOG.map((a) => ({
  key: a.key,
  label: a.label,
  configured: false,
  priceId: null,
  amountCents: null,
  currency: null,
  interval: null,
  metered: a.metered,
  modules: a.modules as string[],
}));

export function AddonsSection() {
  const [addons, setAddons] = useState<BillingAddonInfo[]>(FALLBACK);

  useEffect(() => {
    fetch("/api/billing/plans")
      .then((res) => res.json())
      .then((body) => {
        if (body.stripeEnabled && Array.isArray(body.addons)) setAddons(body.addons);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-[1160px] px-6 py-20 sm:px-12">
      <div className="mb-12 text-center">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Add-ons</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          Add exactly what you need.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] text-[#5a5a56]">
          Every plan covers the core workflow. These add-ons unlock extra capability as you grow.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {addons.map((a) => {
          const Icon = ICONS[a.key as AddonKey] ?? Code2;
          const priceLabel = a.configured ? formatPrice(a.amountCents, a.currency, a.interval) : null;
          const bundled = bundledOn(a.key as AddonKey);
          return (
            <div key={a.key} className="rounded-md border border-[#e6e6e0] bg-white p-6">
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-[#eef4e2]">
                <Icon className="h-4.5 w-4.5 text-[#60ab45]" />
              </div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-[family-name:var(--font-heading)] text-base font-bold text-[#0a0a0a]">
                  {a.label}
                </span>
                <span className="whitespace-nowrap text-sm font-bold text-[#005642]">
                  {priceLabel ?? "Contact us"}
                  {a.metered ? <span className="ml-0.5 text-[10px] font-medium text-slate-400">metered</span> : null}
                </span>
              </div>
              <span className="mb-2 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {moduleTag(a.modules)}
              </span>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#5a5a56]">{DESCRIPTIONS[a.key as AddonKey]}</p>
              {bundled.length > 0 && (
                <p className="mt-3 text-[11.5px] font-medium text-[#60ab45]">
                  Included free on {bundled.join(" & ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
