import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { CalendarDays, MapPinned, Repeat, Clock, Route } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { DispatchBoardMockup } from "@/components/marketing/mockups/DispatchBoardMockup";
import { RealScreenshotStack } from "@/components/marketing/RealScreenshotStack";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Scheduling & Dispatch | Landscapt",
  description: "A daily dispatch board for every crew and every job, with a waiting list for opportunistic scheduling and real-time hours variance against budget.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: CalendarDays,
    title: "Daily Dispatch Board",
    body: "See every crew, every job, every day in one view. Reassign a job with a drag, and see hours variance against budget in real time.",
  },
  {
    icon: MapPinned,
    title: "Waiting List",
    body: "Jobs with a flexible date window instead of a fixed date surface on the Waiting List — geo-tagged for opportunistic scheduling the moment a crew is already nearby.",
  },
  {
    icon: Repeat,
    title: "Every Job Type, One Board",
    body: "Recurring visits, one-time jobs, waiting-list work, bundled packages, snow, and larger projects all schedule from the same dispatch board.",
  },
  {
    icon: Clock,
    title: "Actual vs. Scheduled Hours",
    body: "Crews clock in and out from the field for real actual-hours tracking. If a crew never clocks in, hours fall back to scheduled duration times crew size — never a blank number.",
  },
  {
    icon: Route,
    title: "Route Optimization",
    body: "An add-on that automatically sequences today's stops to minimize drive time between jobs — available on Growth and included on Enterprise.",
  },
];

export default function SchedulingFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Scheduling & Dispatch"
        title="Every crew, every job, every day — in one view."
        subhead="A daily dispatch board modeled after Service Autopilot's, with a waiting list for opportunistic work and real-time hours variance against budget."
        mockupTab="Dispatch Board"
        Mockup={DispatchBoardMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What scheduling &amp; dispatch actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <RealScreenshotStack
        accent="#60ab45"
        images={[
          { src: "/screenshots/dispatch-board.png", alt: "Real Dispatch Board list in Landscapt" },
          { src: "/screenshots/dispatch-job-detail.png", alt: "Real job detail panel on the Dispatch Board" },
        ]}
      />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
