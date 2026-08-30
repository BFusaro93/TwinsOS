import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { CalendarClock, Gauge, Repeat, Bell } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { PMScheduleMockup } from "@/components/marketing/mockups/PMScheduleMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Preventive Maintenance | Equipt",
  description: "PM schedules fire off a calendar interval or a meter reading, and automatically advance after every triggered work order completes.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: CalendarClock,
    title: "Calendar or Meter-Based",
    body: "PM schedules fire off a calendar interval — or a meter reading: hours, mileage, or cycle counts. Pick whichever actually matches how the asset wears.",
  },
  {
    icon: Gauge,
    title: "Meter-Driven Triggers",
    body: "Track hours, miles, gallons, and cycles on any asset, and let a schedule open the work order the moment a threshold is crossed — no one has to remember to check.",
  },
  {
    icon: Repeat,
    title: "Auto-Advancing Thresholds",
    body: "After a triggered work order completes, the threshold automatically advances by the interval — a 36,000-mile oil change with a 5,000-mile interval becomes due at 41,000 miles, automatically.",
  },
  {
    icon: Bell,
    title: "Due & Overdue, Surfaced Automatically",
    body: "Upcoming and overdue PM schedules surface on their own, instead of relying on someone remembering to check a spreadsheet of due dates.",
  },
];

export default function PreventiveMaintenanceFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — Preventive Maintenance"
        title="Maintenance that schedules itself."
        subhead="Calendar- or meter-based PM schedules that automatically advance after every triggered work order completes."
        mockupTab="PM Schedules"
        Mockup={PMScheduleMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Preventive Maintenance actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
