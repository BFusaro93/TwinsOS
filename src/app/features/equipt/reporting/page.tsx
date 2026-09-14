import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Gauge, TrendingUp, PieChart, BookOpen } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { KpiDashboardMockup } from "@/components/marketing/mockups/KpiDashboardMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Reporting & Maintenance Costing | Equipt",
  description: "Track labor efficiency, PM compliance, and maintenance costing across your fleet with a built-in report library and a company-wide scorecard.",
  path: "/features/equipt/reporting",
  image: "/screenshots/equipt-dashboard.png",
});

const ITEMS: DeepDiveItem[] = [
  {
    icon: Gauge,
    title: "Labor Efficiency & PM Compliance",
    body: "Built-in reports track labor efficiency and PM compliance across your fleet, so you can see where maintenance is falling behind before it becomes downtime.",
  },
  {
    icon: TrendingUp,
    title: "Maintenance Costing",
    body: "Roll up labor, parts, and time against a work order to see real cost — the same job costing discipline Landscapt applies to a landscaping job applies here to a repair.",
  },
  {
    icon: BookOpen,
    title: "Built-In Report Library",
    body: "A library of ready-to-run reports covers day-to-day operations, so most questions don't require building a custom query from scratch.",
  },
  {
    icon: PieChart,
    title: "Company-Wide Scorecard",
    body: "Operations metrics roll up into one company-wide scorecard, always current, shared with the same reporting engine Landscapt uses.",
  },
];

export default function EquiptReportingFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Equipt — Reporting & Maintenance Costing"
        title="Know what maintenance is actually costing you."
        subhead="Labor efficiency, PM compliance, and maintenance costing across your fleet, backed by a built-in report library and a company-wide scorecard."
        mockupTab="Scorecard"
        Mockup={KpiDashboardMockup}
        backHref="/features/equipt"
        backLabel="Explore Equipt"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Reporting &amp; Maintenance Costing actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <FeatureSubpageCTA backHref="/features/equipt" backLabel="Back to Equipt overview" />
      <MarketingFooter />
    </div>
  );
}
