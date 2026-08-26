import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { MessageSquareText, Truck, FileSignature, Code2, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { BrandIcon, type BrandSlug } from "@/components/marketing/BrandIcon";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Integrations | Landscapt & Equipt",
  description: "Everything Landscapt & Equipt connects to — QuickBooks, Zapier, Stripe, Twilio, Google Maps, Samsara, and the open API.",
};

type Status = "live" | "addon" | "soon";

function hasBrand(e: IntegrationEntry): e is Extract<IntegrationEntry, { brand: BrandSlug }> {
  return e.brand != null;
}

const STATUS_LABEL: Record<Status, string> = {
  live: "Included",
  addon: "Add-on",
  soon: "Coming soon",
};

const STATUS_CLS: Record<Status, string> = {
  live: "border-green-200 bg-green-100 text-green-800",
  addon: "border-blue-200 bg-blue-50 text-blue-700",
  soon: "border-slate-200 bg-slate-100 text-slate-500",
};

type IntegrationEntry = {
  name: string;
  status: Status;
  body: string;
} & (
  | { icon: React.ComponentType<{ className?: string }>; brand?: never; brandColor?: never }
  | { icon?: never; brand: BrandSlug; brandColor: string }
);

const INTEGRATIONS: IntegrationEntry[] = [
  {
    brand: "quickbooks",
    brandColor: "#2CA01C",
    name: "QuickBooks Online",
    status: "soon",
    body: "Two-way sync for customers, invoices, and payments so your books stay current without double entry.",
  },
  {
    brand: "zapier",
    brandColor: "#FF4A00",
    name: "Zapier",
    status: "live",
    body: "Connect clients, tickets, work orders, requisitions, and jobs to 6,000+ apps — triggers and actions, no add-on required.",
  },
  {
    brand: "stripe",
    brandColor: "#635BFF",
    name: "Stripe",
    status: "live",
    body: "Card and ACH payment processing built into every invoice, plus saved payment methods and optional autopay.",
  },
  {
    icon: MessageSquareText,
    name: "Twilio",
    status: "addon",
    body: "SMS for automations, appointment reminders, and two-way client texting, with TCPA opt-in built in.",
  },
  {
    brand: "googlemaps",
    brandColor: "#4285F4",
    name: "Google Maps",
    status: "live",
    body: "Aerial property measurement, automatic job geocoding, and crew route optimization.",
  },
  {
    icon: Truck,
    name: "Samsara",
    status: "live",
    body: "Pull vehicle odometer and GPS data from your fleet telematics directly into asset records.",
  },
  {
    icon: FileSignature,
    name: "DocuSign",
    status: "soon",
    body: "Send contracts for e-signature directly from the Contracts module.",
  },
  {
    icon: Code2,
    name: "API Access",
    status: "addon",
    body: "A REST API for custom integrations and internal tooling — build whatever your workflow needs on top of your own data.",
  },
  {
    icon: Webhook,
    name: "Webhooks",
    status: "live",
    body: "Outbound webhooks via Zapier's REST hooks keep external systems in sync as records change.",
  },
];

export default function IntegrationsPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Integrations</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          Fits into how you already work.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          Accounting, payments, messaging, mapping, fleet data, and an open API — connected or on the way.
        </p>
      </div>

      <div className="mx-auto max-w-[1160px] px-6 py-20 sm:px-12">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((it, i) => (
            <Reveal
              key={it.name}
              delayMs={i * 50}
              className="rounded-md border border-[#e6e6e0] bg-white p-6 transition-shadow hover:shadow-lg"
            >
              <div className="mb-4 flex items-center justify-between">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-md"
                  style={{ backgroundColor: hasBrand(it) ? `${it.brandColor}14` : "#eef4e2" }}
                >
                  {hasBrand(it) ? (
                    <BrandIcon slug={it.brand} className="h-4.5 w-4.5" style={{ color: it.brandColor }} />
                  ) : (
                    <it.icon className="h-4.5 w-4.5 text-[#60ab45]" />
                  )}
                </div>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_CLS[it.status]}`}>
                  {STATUS_LABEL[it.status]}
                </span>
              </div>
              <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                {it.name}
              </div>
              <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">{it.body}</div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 rounded-lg border border-[#e6e6e0] bg-white p-8 text-center">
          <div className="font-[family-name:var(--font-heading)] mb-2 text-xl font-bold text-[#005642]">
            Don&apos;t see what you need?
          </div>
          <p className="mx-auto mb-6 max-w-md text-[14px] text-[#5a5a56]">
            The API Access add-on and Zapier cover most custom workflows. For anything else, tell us what you&apos;re
            trying to connect.
          </p>
          <Button asChild variant="outline">
            <Link href="/signup">Talk to us</Link>
          </Button>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
