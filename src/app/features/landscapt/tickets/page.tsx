import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { LifeBuoy, AlertTriangle, Clock, Users } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { TicketsMockup } from "@/components/marketing/mockups/TicketsMockup";
import { RealScreenshotStack } from "@/components/marketing/RealScreenshotStack";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Tickets | Landscapt",
  description: "Customer support tickets with priority, status, and automated past-due tracking — visible to clients in their own portal.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: LifeBuoy,
    title: "Track From Open to Resolved",
    body: "Every client issue lives as a ticket with a clear status, instead of scattered across email, texts, and sticky notes.",
  },
  {
    icon: AlertTriangle,
    title: "Priority, Set Once",
    body: "Tickets carry a priority level so the sprinkler zone that's flooding a parking lot doesn't get buried under a mulch-color question.",
  },
  {
    icon: Clock,
    title: "Automated Past-Due Tracking",
    body: "A ticket that's sat too long flags itself as past due automatically — nobody has to remember to check.",
  },
  {
    icon: Users,
    title: "Visible in the Client Portal",
    body: "Clients submit and track their own tickets from the Client Portal, without picking up the phone or waiting on a callback.",
  },
];

export default function TicketsFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Tickets"
        title="Every client issue, tracked to resolution."
        subhead="Priority, status, and automated past-due tracking — visible to clients in their own portal."
        mockupTab="Tickets"
        Mockup={TicketsMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Tickets actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <RealScreenshotStack
        accent="#60ab45"
        images={[
          { src: "/screenshots/tickets.png", alt: "Real Tickets list in Landscapt" },
          { src: "/screenshots/calls.png", alt: "Real Calls list in Landscapt" },
        ]}
      />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
