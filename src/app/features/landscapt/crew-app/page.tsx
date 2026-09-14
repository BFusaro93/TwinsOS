import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ListChecks, Clock, Camera, ClipboardList, WifiOff, KeyRound } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { MobileCrewMockup } from "@/components/marketing/mockups/MobileCrewMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Crew App | Landscapt",
  description: "A dedicated mobile app for field crews — today's stops, clock in/out, photo capture, and material requests, all working offline.",
  path: "/features/landscapt/crew-app",
  image: "/screenshots/dispatch-board.png",
});

const ITEMS: DeepDiveItem[] = [
  {
    icon: ListChecks,
    title: "Today's Stops, Nothing Else",
    body: "Crews see exactly what's on their schedule for the day — client, address, and service — with no sidebar and nothing to train them on.",
  },
  {
    icon: Clock,
    title: "Clock In / Clock Out",
    body: "One tap per visit. Those timestamps feed straight into actual-hours reporting back in the office, instead of a crew never clocking in at all.",
  },
  {
    icon: Camera,
    title: "Photo Capture on Every Visit",
    body: "Take a photo from the camera or library right on the job, attached directly to that visit — no texting photos to the office after the fact.",
  },
  {
    icon: ClipboardList,
    title: "Request Materials from the Field",
    body: "Flag what's needed on a job and it lands as a real requisition back in Purchasing — no radio call, no forgetting to mention it until the next morning.",
  },
  {
    icon: WifiOff,
    title: "Works Offline",
    body: "Clock-ins, photos, and material requests queue locally with a visible sync status and sync automatically the moment the crew's phone is back in range.",
  },
  {
    icon: KeyRound,
    title: "Its Own Login",
    body: "Crew accounts are separate from office logins — shared clock-in credentials that never count toward your seat limit.",
  },
];

export default function CrewAppFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Crew App"
        title="Built for the truck, not the office."
        subhead="Today's stops, clock in/out, photo capture, and material requests — a dedicated mobile app that keeps working even without signal."
        Mockup={MobileCrewMockup}
        chrome="none"
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What the Crew App actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
