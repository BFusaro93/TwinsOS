import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  Calculator,
  CalendarClock,
  Snowflake,
  FileStack,
  TrendingUp,
  CreditCard,
  Users,
  Network,
  PieChart,
  Zap,
  ArrowRight,
  Smartphone,
  LifeBuoy,
  FolderKanban,
  Camera,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { LandscaptShowcase } from "@/components/marketing/LandscaptShowcase";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Landscapt | CRM & Field Service",
  description: "Landscapt runs estimating, dispatch, billing, and client relationships for landscaping and snow companies — built on a real budget engine, not guesswork.",
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Calculator,
    title: "Estimating & Budget Engine",
    body: "Estimates are built from real production rates, labor burden, and overhead markup — not a guess. AI can draft line items from a plain-language description of the work, pulling from your own services and past won estimates.",
  },
  {
    icon: CalendarClock,
    title: "Dispatch & Scheduling",
    body: "A daily dispatch board shows every crew, every job, every day. Reassign jobs with a drag, and see hours variance against budget in real time — even for crews who never clock in, which falls back to scheduled duration times crew size.",
  },
  {
    icon: Snowflake,
    title: "Waiting List & Snow",
    body: "Jobs with a flexible date window instead of a fixed date surface on the Waiting List for opportunistic scheduling when a crew is already nearby. Snow jobs activate the moment a storm trigger depth hits.",
  },
  {
    icon: FileStack,
    title: "Contracts & Packages",
    body: "Signed recurring service agreements and fixed-price bundled programs — like a 7-Step Fert plan or Gold Maintenance — bill automatically on a fixed schedule, with visit usage tracked per package.",
  },
  {
    icon: TrendingUp,
    title: "Job Costing",
    body: "Every job rolls estimated vs. actual labor hours, labor cost, and materials up into real-time gross profit and margin — no spreadsheet reconciliation after the fact.",
  },
  {
    icon: CreditCard,
    title: "Invoicing & Payments",
    body: "Draft-to-paid invoicing with Stripe-powered card and ACH payments built in, at Stripe's standard rates (2.9% + $0.30 card, 0.8% capped at $5 ACH). Clients can save a payment method for optional autopay. A pass-through fee to recover the card cost (3.5% above $500 by default) is on by default and adjustable per company.",
  },
  {
    icon: Users,
    title: "Client Portal & Tickets",
    body: "Clients log in to pay invoices, review and accept estimates, and submit their own support tickets — without picking up the phone. Tickets carry priority, status, and automated past-due tracking.",
  },
  {
    icon: Network,
    title: "Client Hierarchy & Proposals",
    body: "Roll up a property manager's buildings under one parent account with shared billing. Estimates go out as a secure link clients can accept or request changes to — no login required.",
  },
  {
    icon: PieChart,
    title: "Reporting & Automations",
    body: "About 100 built-in reports plus a drag-and-drop dashboard builder, and a trigger → action automation engine for event-driven emails, texts, and alerts.",
  },
];

const DEEP_DIVE_PAGES = [
  { href: "/features/landscapt/estimating", icon: Calculator, title: "Estimating", desc: "Production rates, labor burden, AI-drafted line items" },
  { href: "/features/landscapt/scheduling", icon: CalendarClock, title: "Scheduling & Dispatch", desc: "Daily dispatch board, waiting list, route optimization" },
  { href: "/features/landscapt/snow", icon: Snowflake, title: "Snow", desc: "Storm-based triggers, dedicated routes, seasonal contracts" },
  { href: "/features/landscapt/invoicing", icon: CreditCard, title: "Invoicing & Payments", desc: "Stripe-powered payments, autopay, snow-specific billing" },
  { href: "/features/landscapt/reporting", icon: PieChart, title: "Reporting & Dashboards", desc: "About 100 built-in reports, drag-and-drop dashboards" },
  { href: "/features/landscapt/automations", icon: Zap, title: "Automations", desc: "Event-driven emails, texts, and alerts on every plan" },
  { href: "/features/landscapt/client-portal", icon: Users, title: "Client Portal", desc: "Pay invoices, act on estimates, and submit tickets — self-serve" },
  { href: "/features/landscapt/crew-app", icon: Smartphone, title: "Crew App", desc: "Today's stops, clock in/out, photos, and material requests — offline-ready" },
  { href: "/features/landscapt/tickets", icon: LifeBuoy, title: "Tickets", desc: "Priority, status, and automated past-due tracking" },
  { href: "/features/landscapt/projects", icon: FolderKanban, title: "Projects", desc: "Larger jobs, tracked separately with budget vs. actual" },
  { href: "/features/landscapt/job-photos", icon: Camera, title: "Job Photos", desc: "Before/during/after capture with annotation and tagging" },
  { href: "/features/landscapt/api-integrations", icon: Code2, title: "API & Integrations", desc: "REST API, MCP, QuickBooks, and Zapier" },
];

export default function LandscaptFeaturesPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Landscapt</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          CRM &amp; field service, built for the trade.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          Estimating, dispatch, billing, and client relationships for landscaping and snow companies — on a real
          budget engine, not a guess.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="bg-[#b7d433] text-[#005642] hover:bg-[#a5c02c]">
            <Link href="/signup">Start free trial</Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-[1.5px] border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/features/equipt">Explore Equipt →</Link>
          </Button>
        </div>
      </div>

      <LandscaptShowcase />

      <div className="mx-auto max-w-[1160px] px-6 pb-20 sm:px-12">
        <div className="mb-10 text-center">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Go deeper</div>
          <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
            Explore each area on its own.
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DEEP_DIVE_PAGES.map((p, i) => (
            <Reveal key={p.href} delayMs={i * 50}>
              <Link
                href={p.href}
                className="group flex h-full items-start gap-3 rounded-md border border-[#e6e6e0] bg-white p-5 transition-shadow hover:shadow-md"
              >
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#eef4e2]">
                  <p.icon className="h-4 w-4 text-[#60ab45]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[14.5px] font-bold text-[#0a0a0a]">
                    {p.title}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#60ab45]" />
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{p.desc}</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal className="text-center">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">Every module</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Landscapt actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#60ab45" />

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            Also maintaining a fleet?
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">
            Landscapt shares vendors and one login with Equipt, the asset management &amp; maintenance side of
            the platform.
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
              <Link href="/features/equipt">Explore Equipt</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
