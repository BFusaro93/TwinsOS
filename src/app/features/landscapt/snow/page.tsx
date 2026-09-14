import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Snowflake, Truck, Receipt, FileSignature } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { SnowMockup } from "@/components/marketing/mockups/SnowMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Snow Operations | Landscapt",
  description: "Storm-based scheduling that activates snow routes the moment a trigger depth hits, with seasonal contracts and snow-specific invoicing.",
  path: "/features/landscapt/snow",
  image: "/screenshots/dispatch-board.png",
});

const ITEMS: DeepDiveItem[] = [
  {
    icon: Snowflake,
    title: "Storm-Based Triggers",
    body: "Snow jobs activate the moment a storm trigger depth hits — no manually building a dispatch list at 4 AM.",
  },
  {
    icon: Truck,
    title: "Dedicated Snow Routes",
    body: "Snow routes run separately from regular maintenance routes, so a storm event doesn't collide with the day's mowing or fert schedule.",
  },
  {
    icon: Receipt,
    title: "Snow-Specific Invoicing",
    body: "Snow jobs bill differently from a regular maintenance invoice — per-push or seasonal, matched to how you actually contract snow work.",
  },
  {
    icon: FileSignature,
    title: "Seasonal Contracts",
    body: "A dedicated \"Snow — Seasonal\" contract type bundles the whole season into one recurring agreement, tracked alongside your other Contracts & Packages.",
  },
];

export default function SnowFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Snow"
        title="When the storm hits, the dispatch is already done."
        subhead="Storm-based scheduling activates snow routes automatically, with seasonal contracts and snow-specific invoicing built in."
        mockupTab="Snow Dispatch"
        Mockup={SnowMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What snow operations actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
