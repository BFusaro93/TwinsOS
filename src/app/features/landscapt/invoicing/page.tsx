import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Receipt, CreditCard, RefreshCw, Snowflake, FileStack } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { InvoicingMockup } from "@/components/marketing/mockups/InvoicingMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Invoicing & Payments | Landscapt",
  description: "Draft-to-paid invoicing with Stripe-powered card and ACH payments built in, saved payment methods, and autopay.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Receipt,
    title: "Draft-to-Paid Invoicing",
    body: "A configurable status workflow takes an invoice from draft through sent, paid, or past due — with automated past-due notices along the way.",
  },
  {
    icon: CreditCard,
    title: "Stripe-Powered Payments",
    body: "Clients pay by card or bank transfer at Stripe's standard rates (2.9% + $0.30 per card charge, 0.8% per ACH transfer capped at $5). A pass-through fee to recover the card cost from clients — 3.5% above $500 by default — is on by default and adjustable per company.",
  },
  {
    icon: RefreshCw,
    title: "Saved Payment Methods & Autopay",
    body: "Keep a card or bank account on file, with optional automatic charging on invoice due dates — no chasing a payment every billing cycle.",
  },
  {
    icon: Snowflake,
    title: "Snow-Specific Invoicing",
    body: "Snow jobs bill on their own structure — per-push or seasonal — separate from a regular maintenance invoice.",
  },
  {
    icon: FileStack,
    title: "Contracts & Packages Billing",
    body: "Recurring contracts and bundled service packages generate invoices automatically on their billing schedule, with visit usage tracked per package.",
  },
];

export default function InvoicingFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Invoicing & Payments"
        title="Get paid without chasing a check."
        subhead="Draft-to-paid invoicing with Stripe-powered card and ACH payments, saved payment methods, and autopay built in."
        mockupTab="Invoices"
        Mockup={InvoicingMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What invoicing &amp; payments actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
