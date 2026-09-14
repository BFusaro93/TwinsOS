import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  Wrench,
  MessageSquare,
  CalendarClock,
  Truck,
  Boxes,
  ClipboardCheck,
  Building2,
  Zap,
  PieChart,
  Code2,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { EquiptShowcase } from "@/components/marketing/EquiptShowcase";
import { FeatureDeepDive, type DeepDiveItem } from "@/components/marketing/FeatureDeepDive";
import { RealScreenshot } from "@/components/marketing/RealScreenshot";
import { buildMetadata, SITE_URL } from "@/lib/seo";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Equipt | Asset Management & Maintenance",
  description: "Equipt is the CMMS side of the platform — work orders, preventive maintenance, asset registry, parts inventory, and purchasing in one procurement backbone.",
  path: "/features/equipt",
  image: "/screenshots/equipt-dashboard.png",
});

const SOFTWARE_APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Equipt",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "CMMS for landscape & snow companies — work orders, preventive maintenance, asset registry, parts inventory, and purchasing.",
  url: `${SITE_URL}/features/equipt`,
};

const ITEMS: DeepDiveItem[] = [
  {
    icon: Wrench,
    title: "Work Orders",
    body: "Every maintenance task — from an oil change to an engine rebuild — lives as a Work Order with a full status flow from Open to Done. Parts and labor logged against the job roll straight into that asset's service history.",
  },
  {
    icon: MessageSquare,
    title: "Maintenance Requests",
    body: "Techs and other staff can flag an issue without creating a Work Order themselves — a Maintenance Request routes through approval first, so only qualified requests turn into billable work.",
  },
  {
    icon: CalendarClock,
    title: "Preventive Maintenance",
    body: "PM schedules fire off a calendar interval or a meter reading — hours, mileage, or cycle counts. After a triggered work order completes, the threshold automatically advances by the interval: a 36,000-mile oil change with a 5,000-mile interval becomes due at 41,000 miles, automatically.",
  },
  {
    icon: Truck,
    title: "Asset & Vehicle Registry",
    body: "A full equipment and vehicle registry tracks meter readings and complete service history — the record every work order, PM schedule, and parts usage ties back to.",
  },
  {
    icon: Boxes,
    title: "Parts Inventory",
    body: "Parts are linked to the specific assets that use them, not just a flat catalog, so restocking and PM planning are always tied to the right equipment. A low-stock alert can automatically create a purchase requisition before you run out.",
  },
  {
    icon: ClipboardCheck,
    title: "Purchasing & Approvals",
    body: "Requisitions route through a configurable approval chain before becoming a formal Purchase Order. Receiving a PO automatically updates parts inventory — no manual reconciliation between what was ordered and what's on the shelf.",
  },
  {
    icon: Building2,
    title: "Vendor Management",
    body: "One vendor list is shared across purchasing and maintenance — a vendor who supplies both parts and services shows up once, not twice, with one history to review.",
  },
  {
    icon: Zap,
    title: "Automations",
    body: "Trigger → action rules fire on their own — a meter crossing a threshold creates a work order, a part falling below its reorder point creates a requisition, an upcoming PM notifies the assigned technician. After a triggered work order completes, the threshold automatically advances by the service interval.",
  },
  {
    icon: PieChart,
    title: "Reporting & Maintenance Costing",
    body: "Track labor efficiency, PM compliance, and maintenance costing across your fleet with a built-in report library and a company-wide scorecard.",
  },
  {
    icon: Code2,
    title: "API & Integrations",
    body: "Connect Samsara for automatic vehicle odometer and GPS sync, Zapier for 6,000+ apps, or build your own integration against the REST API.",
  },
];

const DEEP_DIVE_PAGES = [
  { href: "/features/equipt/work-orders", icon: Wrench, title: "Work Orders", desc: "Full status flow, plus Maintenance Requests" },
  { href: "/features/equipt/preventive-maintenance", icon: CalendarClock, title: "Preventive Maintenance", desc: "Calendar or meter-based, auto-advancing thresholds" },
  { href: "/features/equipt/asset-registry", icon: Truck, title: "Asset & Vehicle Registry", desc: "Meter readings and complete service history" },
  { href: "/features/equipt/purchasing-inventory", icon: ClipboardCheck, title: "Purchasing & Inventory", desc: "Requisitions, POs, receiving, and parts inventory" },
  { href: "/features/equipt/vendors", icon: Building2, title: "Vendor Management", desc: "One vendor list, shared across purchasing & maintenance" },
  { href: "/features/equipt/automations", icon: Zap, title: "Automations", desc: "Meter and low-stock triggers that act on their own" },
  { href: "/features/equipt/reporting", icon: PieChart, title: "Reporting & Maintenance Costing", desc: "Labor efficiency, PM compliance, and cost rollups" },
  { href: "/features/equipt/api-integrations", icon: Code2, title: "API & Integrations", desc: "REST API, MCP, Samsara, and Zapier" },
];

export default function EquiptFeaturesPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_APPLICATION_JSON_LD) }}
      />
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Equipt</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          Asset management &amp; maintenance, done right.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          The procurement and maintenance backbone for your fleet, equipment, and facilities — work orders,
          preventive maintenance, and purchasing in one system.
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
            <Link href="/features/landscapt">Explore Landscapt →</Link>
          </Button>
        </div>
      </div>

      <EquiptShowcase />

      <div className="mx-auto max-w-[1160px] px-6 pb-20 sm:px-12">
        <div className="mb-10 text-center">
          <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Go deeper</div>
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
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#e6f5fb]">
                  <p.icon className="h-4 w-4 text-[#2aa9e0]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[14.5px] font-bold text-[#0a0a0a]">
                    {p.title}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#2aa9e0]" />
                  </div>
                  <div className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{p.desc}</div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal className="text-center">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#2aa9e0]">Every module</div>
        <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
          What Equipt actually does.
        </h2>
      </Reveal>

      <FeatureDeepDive items={ITEMS} accent="#2aa9e0" />

      <RealScreenshot src="/screenshots/equipt-dashboard.png" alt="Real Equipt operations dashboard" tab="Dashboard" accent="#2aa9e0" />

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            Also running a service business?
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">
            Equipt shares vendors and one login with Landscapt, the CRM &amp; field service side of the platform.
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
              <Link href="/features/landscapt">Explore Landscapt</Link>
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
