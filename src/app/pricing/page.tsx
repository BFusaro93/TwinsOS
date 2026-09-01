import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { PricingSection } from "@/components/marketing/PricingSection";
import { AddonsSection } from "@/components/marketing/AddonsSection";
import { PlanComparisonTable } from "@/components/settings/PlanComparisonTable";
import { BrandIcon } from "@/components/marketing/BrandIcon";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Pricing | Landscapt & Equipt",
  description: "Plans, add-ons, and a full feature comparison for Landscapt & Equipt. 30-day free trial, no credit card required.",
  path: "/pricing",
});

export default function PricingPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Pricing</div>
        <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          Plans built to grow with your company.
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
        <div className="mx-auto max-w-[1160px] px-6 pb-6 sm:px-12">
          <div className="rounded-lg border border-[#e6e6e0] bg-white p-6">
            <div className="mb-5 flex items-center justify-center gap-2">
              <BrandIcon slug="stripe" className="h-5 w-5" style={{ color: "#635BFF" }} />
              <div className="font-[family-name:var(--font-heading)] text-[15px] font-bold text-[#0a0a0a]">
                Client payment processing
              </div>
            </div>
            <p className="mx-auto mb-6 max-w-xl text-center text-[13px] text-slate-500">
              Card and ACH payments run through Stripe on every plan — no separate fee to turn it on.
            </p>
            <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-[#e6e6e0] bg-[#fbfbf8] p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Stripe&apos;s processing rates
                </div>
                <div className="flex items-center justify-between py-1 text-[13.5px]">
                  <span className="text-slate-600">Card</span>
                  <span className="font-semibold text-[#0a0a0a]">2.9% + $0.30</span>
                </div>
                <div className="flex items-center justify-between py-1 text-[13.5px]">
                  <span className="text-slate-600">ACH transfer</span>
                  <span className="font-semibold text-[#0a0a0a]">0.8% (capped at $5)</span>
                </div>
              </div>
              <div className="rounded-md border border-[#e6e6e0] bg-[#fbfbf8] p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Pass-through fee to clients
                </div>
                <div className="flex items-center justify-between py-1 text-[13.5px]">
                  <span className="text-slate-600">Default rate</span>
                  <span className="font-semibold text-[#0a0a0a]">3.5% above $500</span>
                </div>
                <div className="py-1 text-[12px] leading-relaxed text-slate-500">
                  On by default. Rate, threshold, and whether it&apos;s charged at all are adjustable per
                  company — and waivable per charge.
                </div>
              </div>
            </div>
          </div>
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
