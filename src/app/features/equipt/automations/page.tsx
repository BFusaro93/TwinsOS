import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Zap, Gauge, Boxes, CalendarClock } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { AutomationsMockup } from "@/components/marketing/mockups/AutomationsMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Automations | Equipt",
  description: "Trigger → action rules fire on their own — a meter crossing a threshold creates a work order, a low-stock part creates a requisition.",
  path: "/features/equipt/automations",
  image: "/screenshots/equipt-dashboard.png",
});

const ITEMS: DeepDiveItem[] = [
  {
    icon: Zap,
    title: "Trigger → Action Engine",
    body: "Rules fire on their own — unlimited automations included on every plan, the same engine that powers Landscapt's automations too.",
  },
  {
    icon: Gauge,
    title: "Meter-Based Triggers",
    body: "A meter crossing a threshold creates a work order automatically — hours, mileage, or cycle counts, whichever matches how the asset actually wears.",
  },
  {
    icon: Boxes,
    title: "Low-Stock Triggers",
    body: "A part falling below its reorder point creates a purchase requisition on its own, before the shelf actually runs empty.",
  },
  {
    icon: CalendarClock,
    title: "PM & Escalation Notifications",
    body: "An upcoming PM notifies the assigned technician, and after a triggered work order completes, its threshold automatically advances by the service interval.",
  },
];

export default function EquiptAutomationsFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — Automations"
        title="Meters and stock levels that act on their own."
        subhead="Trigger → action rules that create work orders and requisitions before a problem becomes downtime."
        mockupTab="Automations"
        Mockup={AutomationsMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What automations actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
