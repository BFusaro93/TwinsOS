import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Building2, Layers, Receipt } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { VendorsMockup } from "@/components/marketing/mockups/VendorsMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Vendor Management | Equipt",
  description: "One vendor list shared across purchasing and maintenance — a vendor who supplies both parts and services shows up once, not twice.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Building2,
    title: "One Vendor List, Shared",
    body: "The vendors table is product-agnostic — a vendor who supplies both landscape materials and maintenance parts shows up once, not as two separate records.",
  },
  {
    icon: Layers,
    title: "Shared Across Purchasing & Maintenance",
    body: "Vendor management is surfaced in both the Purchasing and Maintenance sides of Equipt, but they read and write the same underlying record — no duplicate entry, ever.",
  },
  {
    icon: Receipt,
    title: "One History to Review",
    body: "See every requisition, PO, and service history tied to a vendor in one place, instead of piecing it together across separate systems.",
  },
];

export default function VendorsFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — Vendor Management"
        title="One vendor list. No duplicate entry."
        subhead="Vendors are shared across Purchasing and Maintenance — a supplier who does both shows up once, with one history to review."
        mockupTab="Vendors"
        Mockup={VendorsMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Vendor Management actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
