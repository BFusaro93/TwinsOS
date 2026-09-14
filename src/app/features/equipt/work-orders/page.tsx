import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Wrench, MessageSquare, ClipboardCheck, History } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { WorkOrderMockup } from "@/components/marketing/mockups/WorkOrderMockup";
import { RealScreenshot } from "@/components/marketing/RealScreenshot";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Work Orders | Equipt",
  description: "Every maintenance task lives as a Work Order with a full status flow, plus Maintenance Requests that route through approval before becoming one.",
  path: "/features/equipt/work-orders",
  image: "/screenshots/equipt-dashboard.png",
});

const ITEMS: DeepDiveItem[] = [
  {
    icon: Wrench,
    title: "Full Status Flow, Open to Done",
    body: "Every maintenance task — from an oil change to an engine rebuild — lives as a Work Order with a clear status flow, so nothing sits in limbo.",
  },
  {
    icon: MessageSquare,
    title: "Maintenance Requests",
    body: "Techs and other staff can flag an issue without creating a Work Order directly. A Maintenance Request routes through approval first, so only qualified requests turn into billable work.",
  },
  {
    icon: ClipboardCheck,
    title: "Parts & Labor Logged Per Job",
    body: "Parts and labor logged against a Work Order roll straight into that asset's service history — no separate spreadsheet to reconcile after the fact.",
  },
  {
    icon: History,
    title: "Complete Service History",
    body: "Every Work Order ties back to the asset it was performed on, building a real maintenance history you can actually search instead of digging through paper tickets.",
  },
];

export default function WorkOrdersFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — Work Orders"
        title="Every repair, tracked from open to done."
        subhead="Work Orders carry a full status flow, with parts and labor rolling straight into each asset's service history."
        mockupTab="Work Orders"
        Mockup={WorkOrderMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Work Orders actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <RealScreenshot src="/screenshots/work-orders.png" alt="Real Work Orders list in Equipt" tab="Work Orders" accent="#2aa9e0" />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
