import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Calculator, Sparkles, FileCheck2, TrendingUp, LineChart } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeatureSubpageHero } from "@/components/marketing/FeatureSubpageHero";
import { FeatureSubpageCTA } from "@/components/marketing/FeatureSubpageCTA";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { EstimatesPipelineMockup } from "@/components/marketing/mockups/EstimatesPipelineMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Estimating | Landscapt",
  description: "Build estimates from real production rates, labor burden, and overhead markup — not a guess. AI-drafted line items and client-facing proposals, no login required.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Calculator,
    title: "Budget-Based Estimating",
    body: "Production rates times labor burden, plus materials times overhead markup, roll up into a configurable margin slider — the same budget engine that job costing measures actual performance against later.",
  },
  {
    icon: Sparkles,
    title: "AI-Drafted Line Items",
    body: "Describe the work in plain language and get suggested line items from Claude, based on your own services and past won estimates — up to 50 drafts per organization per day.",
  },
  {
    icon: FileCheck2,
    title: "Client-Facing Proposals",
    body: "Clients open a secure link to accept an estimate or request changes — no login, no phone tag, no PDF email attachments.",
  },
  {
    icon: LineChart,
    title: "Production Rate Accuracy",
    body: "A dedicated report compares budgeted vs. actual hours per service across every completed job, so your production rates get more accurate every season instead of staying a one-time guess.",
  },
  {
    icon: TrendingUp,
    title: "Feeds Job Costing Automatically",
    body: "Every accepted estimate becomes the budget baseline a job is measured against — no separate budget entry step, no spreadsheet reconciliation after the fact.",
  },
];

export default function EstimatingFeaturePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <FeatureSubpageHero
        kicker="Landscapt — Estimating"
        title="Estimates built on real numbers, not a gut feeling."
        subhead="Production rates, labor burden, and overhead markup roll up into a configurable margin — the same engine job costing measures you against later."
        mockupTab="Estimates"
        Mockup={EstimatesPipelineMockup}
      />

      <Reveal className="mx-auto max-w-[1160px] px-6 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Capabilities</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What estimating actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <FeatureSubpageCTA />
      <MarketingFooter />
    </div>
  );
}
