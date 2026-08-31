import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ClipboardCheck, PackageCheck, Boxes, Bell, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { PurchasingMockup } from "@/components/marketing/mockups/PurchasingMockup";
import { RealScreenshotStack } from "@/components/marketing/RealScreenshotStack";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Purchasing, Requisitions & Inventory | Equipt",
  description: "Requisitions route through a configurable approval chain before becoming a formal PO, and receiving one automatically updates parts inventory.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: ClipboardCheck,
    title: "Requisitions → Approval Chain → PO",
    body: "A requisition routes through a configurable approval chain before it becomes a formal Purchase Order — only the current approver in the chain can approve or reject it.",
  },
  {
    icon: PackageCheck,
    title: "Receiving Updates Inventory Automatically",
    body: "Receiving a PO automatically updates parts inventory — no manual reconciliation between what was ordered and what's actually on the shelf.",
  },
  {
    icon: Boxes,
    title: "Parts Linked to Assets",
    body: "Parts aren't a flat catalog — each one is linked to the specific assets that use it, so restocking and PM planning are always tied to the right equipment.",
  },
  {
    icon: Bell,
    title: "Low-Stock Auto-Requisitioning",
    body: "A low-stock alert can automatically create a purchase requisition before you run out, instead of finding out mid-job.",
  },
  {
    icon: BookOpen,
    title: "One Products Catalog",
    body: "Every line item on a requisition or PO references a real Products catalog entry — maintenance part, stocked material, or project material — never a free-text description to reconcile later.",
  },
];

export default function PurchasingInventoryFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — Purchasing, Requisitions & Inventory"
        title="From request to received, with no reconciliation."
        subhead="A configurable approval chain turns a requisition into a formal PO, and receiving it automatically updates parts inventory."
        mockupTab="Purchasing"
        Mockup={PurchasingMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Purchasing &amp; Inventory actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <RealScreenshotStack
        accent="#2aa9e0"
        images={[
          { src: "/screenshots/purchasing-inventory.png", alt: "Real Parts Inventory list in Equipt" },
          { src: "/screenshots/parts-overview.png", alt: "Real part detail with linked vendors in Equipt" },
        ]}
      />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
