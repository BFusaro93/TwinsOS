import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Plus_Jakarta_Sans } from "next/font/google";
import { FolderKanban, TrendingUp, BookOpen, ClipboardCheck } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { ProjectsMockup } from "@/components/marketing/mockups/ProjectsMockup";
import { RealScreenshot } from "@/components/marketing/RealScreenshot";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Projects | Landscapt",
  description: "A dedicated job type for larger landscaping projects, tracked separately from recurring and one-time visits, with materials and budget rolled up per project.",
  path: "/features/landscapt/projects",
  image: "/screenshots/dispatch-board.png",
});

const ITEMS: DeepDiveItem[] = [
  {
    icon: FolderKanban,
    title: "Its Own Job Type",
    body: "Larger landscaping projects — a full install, a big irrigation retrofit — track separately from recurring and one-time visits, so they don't get lost in the daily dispatch noise.",
  },
  {
    icon: BookOpen,
    title: "Materials Assigned Per Project",
    body: "Purchase order line items for stocked or project material can be assigned a Project, rolling material cost up into that job automatically instead of a manual spreadsheet.",
  },
  {
    icon: TrendingUp,
    title: "Budget vs. Actual, in Real Time",
    body: "Every project rolls estimated vs. actual labor and materials up into real-time gross profit and margin — the same job costing discipline applied to a larger scope.",
  },
  {
    icon: ClipboardCheck,
    title: "One Requisition Path",
    body: "A project can spawn a purchase requisition when materials are needed, same pattern as a Work Order — no separate purchasing process to learn.",
  },
];

export default function ProjectsFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Projects"
        title="Big jobs, tracked like the big jobs they are."
        subhead="A dedicated job type for larger landscaping projects, with materials and budget rolled up per project in real time."
        mockupTab="Projects"
        Mockup={ProjectsMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Projects actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <RealScreenshot src="/screenshots/projects.png" alt="Real Projects list in Landscapt" tab="Projects" accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
