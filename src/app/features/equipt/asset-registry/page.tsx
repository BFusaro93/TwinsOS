import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Truck, Gauge, History, Boxes } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { AssetDetailMockup } from "@/components/marketing/mockups/AssetDetailMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Asset & Vehicle Registry | Equipt",
  description: "A full equipment and vehicle registry tracking meter readings and complete service history — the record every work order and PM schedule ties back to.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Truck,
    title: "One Registry for Equipment & Vehicles",
    body: "Every piece of equipment and every vehicle lives in one registry — the record every work order, PM schedule, and parts usage ties back to.",
  },
  {
    icon: Gauge,
    title: "Meter Readings, Tracked Per Asset",
    body: "Hours, mileage, gallons, or cycle counts logged directly on the asset feed both PM schedules and reporting, without a separate tracking spreadsheet.",
  },
  {
    icon: History,
    title: "Complete Service History",
    body: "Every work order performed against an asset builds its history automatically — parts used, labor logged, and dates, all in one place.",
  },
  {
    icon: Boxes,
    title: "Linked Parts, Not a Guess",
    body: "Parts are linked to the specific assets that use them, so when it's time to restock or plan a PM, it's tied to the right equipment instead of a flat catalog.",
  },
];

export default function AssetRegistryFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — Asset & Vehicle Registry"
        title="Every asset's whole history, in one place."
        subhead="Meter readings and complete service history for every piece of equipment and every vehicle you run."
        mockupTab="Asset Detail"
        Mockup={AssetDetailMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What the Asset &amp; Vehicle Registry actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
