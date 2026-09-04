import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/marketing/PricingSection";
import { ProductShowcase } from "@/components/marketing/ProductShowcase";
import { Reveal } from "@/components/marketing/Reveal";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { BrowserFrame } from "@/components/marketing/mockups/BrowserFrame";
import { DispatchBoardMockup } from "@/components/marketing/mockups/DispatchBoardMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

const crmFeatures = [
  {
    title: "Estimating",
    body: "Budget-based estimates built from production rates, labor burden, and overhead markup — with AI-drafted line items to start faster.",
  },
  {
    title: "Dispatch & Scheduling",
    body: "A daily dispatch board plus a geo-tagged waiting list for opportunistic jobs when a crew is already nearby.",
  },
  {
    title: "Snow & Contracts",
    body: "Storm-based snow dispatch and recurring contracts for bundled service programs, billed on a fixed monthly schedule.",
  },
  {
    title: "Invoicing & Payments",
    body: "Draft-to-paid invoicing with online card and ACH payments, saved payment methods, and optional autopay.",
  },
];

const cmmsFeatures = [
  {
    title: "Work Orders",
    body: "Track inspection, repair, and maintenance tasks against a full asset registry, with complete maintenance history.",
  },
  {
    title: "Preventive Maintenance",
    body: "Recurring PM schedules triggered by calendar interval or by meter reading — hours, mileage, or cycle counts.",
  },
  {
    title: "Purchasing & Receiving",
    body: "Requisitions route through a configurable approval chain, become POs, and receiving updates parts inventory automatically.",
  },
  {
    title: "Parts & Vendors",
    body: "Spare parts inventory linked to the assets that use them, and one vendor list shared across purchasing and maintenance.",
  },
];

export function LandingPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      {/* HERO */}
      <div className="bg-[#005642] px-6 py-20 sm:px-12">
        <div className="mx-auto grid max-w-[1320px] items-center gap-10 lg:grid-cols-[2fr_3fr] lg:gap-14">
          <div className="text-center lg:text-left">
            <div className="mb-7 inline-block rounded-full bg-[#2aa9e026] px-3.5 py-1.5 text-[13px] font-bold tracking-wide text-[#2aa9e0]">
              BUILT FOR LANDSCAPERS, BY LANDSCAPERS
            </div>
            <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
              One industry.
              <br />
              One platform.
              <br />
              Two systems.
              <br />
              One login.
            </h1>
            <p className="mx-auto mb-10 mt-6 max-w-[480px] text-lg leading-relaxed text-[#cfe6d8] lg:mx-0">
              Landscapt runs estimating, dispatch, billing, and client relationships. Equipt runs asset
              maintenance and purchasing. One platform, one login, built for landscaping and snow companies.
            </p>
            <div className="flex flex-wrap justify-center gap-4 lg:justify-start">
              <Button asChild size="lg" className="bg-[#b7d433] text-[#005642] hover:bg-[#a5c02c]">
                <Link href="/signup">Start free trial</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-[1.5px] border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/features">See what&apos;s included</Link>
              </Button>
            </div>
          </div>

          <div className="min-w-0 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <BrowserFrame tabs={["Jobs", "Crews", "Assets", "Billing"]} activeTab="Jobs">
              <DispatchBoardMockup />
            </BrowserFrame>
          </div>
        </div>
      </div>

      {/* TWO SYSTEMS, ONE LOGIN */}
      <div id="product" className="mx-auto max-w-[1160px] px-6 pt-24 pb-8 sm:px-12">
        <Reveal className="mb-14 text-center">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
            Two systems, one login
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
            Run the business. Manage the fleet.
          </h2>
        </Reveal>

        <Reveal className="overflow-hidden rounded-2xl border border-[#e6e6e0]">
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="bg-[#eef4e2] p-8 sm:p-10 md:border-r md:border-[#dbe9c8]">
              <div className="mb-8 flex items-center gap-2.5">
                <span className="inline-block h-[11px] w-[11px] rounded-[3px] bg-[#60ab45]" />
                <span className="font-[family-name:var(--font-heading)] text-base font-extrabold text-[#005642]">
                  Landscapt — CRM &amp; field service
                </span>
              </div>
              <div className="flex flex-col gap-7">
                {crmFeatures.map((f) => (
                  <div key={f.title}>
                    <div className="font-[family-name:var(--font-heading)] mb-1.5 text-[15px] font-bold text-[#0a0a0a]">
                      {f.title}
                    </div>
                    <div className="text-[13.5px] leading-relaxed text-[#4a6b1a]">{f.body}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-[#e6f5fb] p-8 sm:p-10">
              <div className="mb-8 flex items-center gap-2.5">
                <span className="inline-block h-[11px] w-[11px] rounded-full bg-[#2aa9e0]" />
                <span className="font-[family-name:var(--font-heading)] text-base font-extrabold text-[#005642]">
                  Equipt — maintenance &amp; purchasing
                </span>
              </div>
              <div className="flex flex-col gap-7">
                {cmmsFeatures.map((f) => (
                  <div key={f.title}>
                    <div className="font-[family-name:var(--font-heading)] mb-1.5 text-[15px] font-bold text-[#0a0a0a]">
                      {f.title}
                    </div>
                    <div className="text-[13.5px] leading-relaxed text-[#2c6a86]">{f.body}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>

      {/* SEE IT IN ACTION */}
      <Reveal>
        <ProductShowcase />
      </Reveal>

      {/* NOTE */}
      <div className="bg-[#005642] px-6 py-16 sm:px-12">
        <Reveal className="mx-auto max-w-[760px] text-center">
          <Sparkles className="mx-auto mb-5 h-6 w-6 text-[#b7d433]" />
          <div className="font-[family-name:var(--font-heading)] mb-5 text-2xl font-bold leading-relaxed text-white sm:text-[26px]">
            &ldquo;Built for landscaping and snow operations from the ground up — estimating, dispatch,
            billing, and equipment maintenance in one system instead of five logins.&rdquo;
          </div>
          <div className="text-sm text-[#a9d3bf]">The team behind Landscapt &amp; Equipt</div>
          <div className="mx-auto mt-7 max-w-[560px] rounded-lg border border-white/15 bg-white/5 px-5 py-4 text-[13.5px] leading-relaxed text-[#cfe6d8]">
            <span className="font-semibold text-white">One purpose:</span> replace the five different logins a
            landscaping and snow company juggles with one system built the way the work actually happens — and
            put real numbers behind every decision. Job costing, production rates, and margin data that used to
            live in someone&apos;s head or a spreadsheet after the fact now drive estimates and show up the
            moment a job is done, so growth and profitability decisions are backed by data, not a gut feeling.
          </div>
        </Reveal>
      </div>

      {/* PRICING */}
      <Reveal>
        <PricingSection />
        <div className="-mt-10 pb-16 text-center">
          <Link href="/pricing" className="text-sm font-semibold text-[#005642] hover:underline">
            Compare full plan details &amp; add-ons →
          </Link>
        </div>
      </Reveal>

      {/* CTA */}
      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            See it running on your own jobs.
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">30-day free trial. No credit card required. Set up in an afternoon.</div>
          <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
            <Link href="/signup">Start free trial</Link>
          </Button>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
