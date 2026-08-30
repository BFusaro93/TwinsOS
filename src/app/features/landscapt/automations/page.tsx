import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Zap, CheckCircle2, Receipt, MessageSquareText, Building2 } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { CRMAutomationsMockup } from "@/components/marketing/mockups/CRMAutomationsMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Automations | Landscapt",
  description: "An event-driven trigger → action engine for emails, texts, and alerts — unlimited rules on every plan, spanning both Landscapt and Equipt.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Zap,
    title: "Trigger → Action Engine",
    body: "Build a rule once and it fires on its own — unlimited automation rules included on every plan, no per-rule pricing to think about.",
  },
  {
    icon: CheckCircle2,
    title: "Job & Estimate Triggers",
    body: "Job completed → follow-up email 24 hours later. Estimate sent but not viewed in 48 hours → text reminder. The moments clients actually respond to, handled without a human remembering to send them.",
  },
  {
    icon: Receipt,
    title: "Invoice & Payment Triggers",
    body: "Automated past-due notices and autopay confirmations keep the billing conversation moving without a staff member checking invoice status by hand.",
  },
  {
    icon: MessageSquareText,
    title: "Email & SMS Channels",
    body: "Rules can fire an email or a text from the same builder. SMS ships with 500 messages included, then $10 per 250 over.",
  },
  {
    icon: Building2,
    title: "Spans Both Products",
    body: "The same trigger → action engine also runs Equipt's meter and PM-schedule automations, so an org on one login can build rules across both sides of the business.",
  },
];

export default function AutomationsFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Automations"
        title="Follow-ups that send themselves."
        subhead="An event-driven trigger → action engine for emails, texts, and alerts — unlimited rules included on every plan."
        mockupTab="Automations"
        Mockup={CRMAutomationsMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What automations actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
