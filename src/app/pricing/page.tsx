import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { PricingSection } from "@/components/marketing/PricingSection";
import { AddonsSection } from "@/components/marketing/AddonsSection";
import { PlanComparisonTable } from "@/components/settings/PlanComparisonTable";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Pricing | Landscapt & Equipt",
  description: "Plans, add-ons, and a full feature comparison for Landscapt & Equipt. 30-day free trial, no credit card required.",
};

export default function PricingPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Pricing</div>
        <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          Plans built to grow with your crew.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          30-day free trial on any plan. No credit card required to start.
        </p>
      </div>

      <PricingSection showHeader={false} />

      <Reveal>
        <div className="mx-auto max-w-[1160px] px-6 pb-6 sm:px-12">
          <div className="mb-10 text-center">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
              Full comparison
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
              Every feature, plan by plan.
            </h2>
          </div>
          <PlanComparisonTable />
        </div>
      </Reveal>

      <Reveal>
        <AddonsSection />
      </Reveal>

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            Still deciding? Try it free for 30 days.
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">No credit card required. Set up in an afternoon.</div>
          <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
            <Link href="/signup">Start free trial</Link>
          </Button>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
