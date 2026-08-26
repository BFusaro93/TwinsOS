import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  Calculator,
  CalendarClock,
  Snowflake,
  Receipt,
  Wrench,
  ClipboardList,
  Gauge,
  Boxes,
  Sparkles,
} from "lucide-react";
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
    icon: Calculator,
    title: "Estimating",
    body: "Budget-based estimates built from production rates, labor burden, and overhead markup — with AI-drafted line items to start faster.",
  },
  {
    icon: CalendarClock,
    title: "Dispatch & Scheduling",
    body: "A daily dispatch board plus a geo-tagged waiting list for opportunistic jobs when a crew is already nearby.",
  },
  {
    icon: Snowflake,
    title: "Snow & Contracts",
    body: "Storm-based snow dispatch and recurring contracts for bundled service programs, billed on a fixed monthly schedule.",
  },
  {
    icon: Receipt,
    title: "Invoicing & Payments",
    body: "Draft-to-paid invoicing with online card and ACH payments, saved payment methods, and optional autopay.",
  },
];

const cmmsFeatures = [
  {
    icon: Wrench,
    title: "Work Orders",
    body: "Track inspection, repair, and maintenance tasks against a full asset registry, with complete maintenance history.",
  },
  {
    icon: Gauge,
    title: "Preventive Maintenance",
    body: "Recurring PM schedules triggered by calendar interval or by meter reading — hours, mileage, or cycle counts.",
  },
  {
    icon: ClipboardList,
    title: "Purchasing & Receiving",
    body: "Requisitions route through a configurable approval chain, become POs, and receiving updates parts inventory automatically.",
  },
  {
    icon: Boxes,
    title: "Parts & Vendors",
    body: "Spare parts inventory linked to the assets that use them, and one vendor list shared across purchasing and maintenance.",
  },
];

export function LandingPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      {/* HERO */}
      <div className="bg-[#005642] px-6 py-24 text-center sm:px-12 sm:py-28">
        <div className="mx-auto max-w-[760px]">
          <div className="mb-7 inline-block rounded-full bg-[#b7d43326] px-3.5 py-1.5 text-[13px] font-bold tracking-wide text-[#b7d433]">
            BUILT FOR LANDSCAPERS, BY LANDSCAPERS
          </div>
          <h1 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-6xl">
            One industry.
            <br />
            Two systems. One login.
          </h1>
          <p className="mx-auto mb-10 mt-6 max-w-[540px] text-lg leading-relaxed text-[#cfe6d8]">
            Landscapt runs estimating, dispatch, billing, and client relationships. Equipt runs asset
            maintenance and purchasing. One platform, one login, built for landscaping and snow companies.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
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

        <div className="mx-auto mt-16 max-w-[1040px] animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <BrowserFrame tabs={["Jobs", "Crews", "Assets", "Billing"]} activeTab="Jobs">
            <DispatchBoardMockup />
          </BrowserFrame>
        </div>
      </div>

      {/* TWO SYSTEMS, ONE LOGIN */}
      <div id="product" className="mx-auto max-w-[1160px] px-6 pt-24 pb-8 sm:px-12">
        <Reveal className="mb-14 text-center">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
            Two systems, one login
          </div>
          <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
            Run the business. Run the fleet.
          </h2>
        </Reveal>

        <Reveal className="mb-5 flex items-center gap-2.5">
          <span className="inline-block h-[11px] w-[11px] rounded-[3px] bg-[#60ab45]" />
          <span className="font-[family-name:var(--font-heading)] text-base font-extrabold text-[#005642]">
            Landscapt — CRM &amp; field service
          </span>
        </Reveal>
        <div className="mb-11 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {crmFeatures.map((f, i) => (
            <Reveal key={f.title} delayMs={i * 75} className="rounded-md border border-[#e6e6e0] bg-white p-6 transition-shadow hover:shadow-lg">
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-md bg-[#eef4e2]">
                <f.icon className="h-4 w-4 text-[#60ab45]" />
              </div>
              <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                {f.title}
              </div>
              <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">{f.body}</div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mb-5 flex items-center gap-2.5">
          <span className="inline-block h-[11px] w-[11px] rounded-full bg-[#2aa9e0]" />
          <span className="font-[family-name:var(--font-heading)] text-base font-extrabold text-[#005642]">
            Equipt — maintenance &amp; purchasing
          </span>
        </Reveal>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {cmmsFeatures.map((f, i) => (
            <Reveal key={f.title} delayMs={i * 75} className="rounded-md border border-[#e6e6e0] bg-white p-6 transition-shadow hover:shadow-lg">
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-md bg-[#e6f5fb]">
                <f.icon className="h-4 w-4 text-[#2aa9e0]" />
              </div>
              <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                {f.title}
              </div>
              <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">{f.body}</div>
            </Reveal>
          ))}
        </div>
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
