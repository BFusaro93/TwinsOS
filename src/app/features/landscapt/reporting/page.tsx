import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Plus_Jakarta_Sans } from "next/font/google";
import { PieChart, LayoutDashboard, Gauge, BarChart3, Clock } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { DashboardBuilderMockup } from "@/components/marketing/mockups/DashboardBuilderMockup";
import { RealScreenshot } from "@/components/marketing/RealScreenshot";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Reporting & Dashboards | Landscapt",
  description: "About 100 built-in reports plus a drag-and-drop dashboard builder, a graphics library of reusable visuals, and a company-wide KPI scorecard.",
  path: "/features/landscapt/reporting",
  image: "/screenshots/dispatch-board.png",
});

const ITEMS: DeepDiveItem[] = [
  {
    icon: PieChart,
    title: "About 100 Built-In Reports",
    body: "Job costing, revenue, receivables, production-rate accuracy, and dozens more — covering day-to-day operations without building a query from scratch.",
  },
  {
    icon: LayoutDashboard,
    title: "Drag-and-Drop Dashboard Builder",
    body: "Build a custom dashboard from any report's output — bar, line, gauge, or crosstab visuals, with top-N grouping and formula columns for derived metrics.",
  },
  {
    icon: BarChart3,
    title: "Graphics Library",
    body: "A catalog of pre-made panel-level visuals — system-defined and your own saved ones — that drop into any dashboard from the builder or the Report Center.",
  },
  {
    icon: Gauge,
    title: "Company-Wide KPI Scorecard",
    body: "Financial, operations, and sales targets roll up into one scorecard that's always current — no spreadsheet to maintain.",
  },
  {
    icon: Clock,
    title: "Scheduled Delivery",
    body: "Set a report to run on a schedule and land in the right inbox automatically, instead of someone remembering to pull it every week.",
  },
];

export default function ReportingFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Reporting & Dashboards"
        title="Know your numbers without a spreadsheet."
        subhead="About 100 built-in reports, a drag-and-drop dashboard builder, and a company-wide scorecard — always current, no manual reconciliation."
        mockupTab="Dashboards"
        Mockup={DashboardBuilderMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What reporting &amp; dashboards actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <RealScreenshot src="/screenshots/my-day.png" alt="Real My Day dashboard in Landscapt" tab="My Day" accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
