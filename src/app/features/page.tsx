import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import {
  MapPinned,
  FileCheck2,
  Network,
  FolderKanban,
  Snowflake,
  FileStack,
  ShieldAlert,
  Route,
  CreditCard,
  Users,
  LifeBuoy,
  MessageSquareText,
  PieChart,
  Zap,
  Wrench,
  CalendarClock,
  Boxes,
  ClipboardCheck,
  Building2,
  Code2,
  Truck,
  MessageSquare,
  Shield,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeaturesShowcase } from "@/components/marketing/FeaturesShowcase";
import { SidebarMockup } from "@/components/marketing/mockups/SidebarMockup";
import { MobileCrewMockup } from "@/components/marketing/mockups/MobileCrewMockup";
import { ClientPortalMockup } from "@/components/marketing/mockups/ClientPortalMockup";
import { DashboardBuilderMockup } from "@/components/marketing/mockups/DashboardBuilderMockup";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Features | Landscapt & Equipt",
  description: "Every module in Landscapt & Equipt — dispatch, estimating, work orders, tickets, job photos, automations, and more.",
};

const CATEGORIES = [
  {
    label: "Sales & Client Relationships",
    sub: "Landscapt",
    items: [
      { icon: MapPinned, title: "Waiting List", body: "Geo-tagged jobs with a flexible date window, ready to slot in whenever a crew is already working nearby." },
      { icon: FileCheck2, title: "Client-Facing Proposals", body: "Clients open a secure link to accept or request changes to an estimate — no login, no phone tag." },
      { icon: Network, title: "Client Hierarchy", body: "Roll up a property manager's buildings under one parent account, with shared billing and reporting." },
      { icon: FolderKanban, title: "Projects", body: "A dedicated job type for larger landscaping projects, tracked separately from recurring and one-time visits." },
    ],
  },
  {
    label: "Scheduling & Field Service",
    sub: "Landscapt",
    items: [
      { icon: Snowflake, title: "Snow & Storm Dispatch", body: "Storm-based scheduling that activates your snow routes the moment a trigger depth hits." },
      { icon: FileStack, title: "Contracts & Packages", body: "Signed recurring service agreements and fixed-price bundled programs — like a 7-Step Fert plan — billed automatically." },
      { icon: ShieldAlert, title: "Damage Cases", body: "Track property damage incidents from report to resolution, with linked expenses and a running cost chart." },
      { icon: Route, title: "Route Optimization & Mapping", body: "Aerial property measurement, automatic job geocoding, and route sequencing to cut drive time between stops." },
    ],
  },
  {
    label: "Billing & Support",
    sub: "Landscapt",
    items: [
      { icon: CreditCard, title: "Credit Card & ACH Processing", body: "Stripe-powered online payments built into every invoice — clients pay by card or bank transfer." },
      { icon: Users, title: "Client Portal", body: "Clients log in to view and pay invoices, review estimates, and submit their own tickets." },
      { icon: LifeBuoy, title: "Tickets", body: "Customer support tickets with priority, status, and automated past-due tracking — visible to clients in their own portal." },
      { icon: MessageSquareText, title: "SMS & Client Texting", body: "Two-way texting for reminders, updates, and quick client questions, with TCPA opt-in built in." },
    ],
  },
  {
    label: "Maintenance & Purchasing",
    sub: "Equipt",
    items: [
      { icon: Wrench, title: "Work Orders", body: "Track inspection, repair, and maintenance tasks against a full asset registry, with complete history on every job." },
      { icon: CalendarClock, title: "Preventive Maintenance", body: "Recurring PM schedules triggered by calendar interval or by meter reading — hours, mileage, or cycle counts." },
      { icon: Boxes, title: "Parts Inventory & Asset Linking", body: "A parts catalog linked to the specific assets that use it, so restocking and PM planning are always tied to the right equipment." },
      { icon: ClipboardCheck, title: "Purchasing & Approvals", body: "Requisitions route through a configurable approval chain before becoming a formal PO to a vendor." },
      { icon: Building2, title: "Vendor Management", body: "One vendor list shared across purchasing and maintenance — no duplicate entry between products." },
      { icon: Code2, title: "API Access", body: "Programmatic access to your data for custom integrations and internal tooling." },
      { icon: Truck, title: "Asset & Vehicle Registry", body: "A full equipment and vehicle registry with service history — the backbone every work order, PM schedule, and meter ties back to." },
      { icon: MessageSquare, title: "Maintenance Requests", body: "Let techs and requestors flag issues without creating a work order directly — requests route through approval before becoming one." },
    ],
  },
  {
    label: "Platform-wide",
    sub: "Shared",
    items: [
      { icon: Zap, title: "Automations", body: "One trigger → action engine spans both products — job completed, part low stock, PM due — firing emails, texts, or work orders." },
      { icon: PieChart, title: "Reporting & Custom Dashboards", body: "About 100 built-in reports — including job costing, revenue, and receivables — plus a drag-and-drop dashboard and analysis builder for everything else." },
      { icon: UserCog, title: "Roles & Permissions", body: "Six role types — Admin, Manager, Purchaser, Technician, Requestor, Viewer — control exactly what each person can see and do." },
      { icon: Shield, title: "Data Isolation & Security", body: "Every record is scoped to your organization at the database level — queries that don't match your org simply return nothing." },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Product</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          Everything your operation runs on.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          One login covers estimating and dispatch, billing and client relationships, plus asset maintenance and
          purchasing — with the workflow-specific modules a landscaping and snow company actually needs.
        </p>
      </div>

      {/* PRODUCT PICKER */}
      <div className="mx-auto max-w-[1160px] px-6 pt-16 sm:px-12">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Link
            href="/features/landscapt"
            className="group rounded-[10px] border border-[#e6e6e0] bg-white p-7 transition-shadow hover:shadow-lg"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block h-[11px] w-[11px] rounded-[3px] bg-[#60ab45]" />
              <span className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[#005642]">
                Landscapt
              </span>
            </div>
            <p className="mb-4 text-[14px] leading-relaxed text-[#5a5a56]">
              CRM &amp; field service — estimating, dispatch, billing, and client relationships.
            </p>
            <span className="text-[13px] font-semibold text-[#60ab45] group-hover:underline">
              Explore Landscapt →
            </span>
          </Link>
          <Link
            href="/features/equipt"
            className="group rounded-[10px] border border-[#e6e6e0] bg-white p-7 transition-shadow hover:shadow-lg"
          >
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-block h-[11px] w-[11px] rounded-full bg-[#2aa9e0]" />
              <span className="font-[family-name:var(--font-heading)] text-lg font-extrabold text-[#005642]">
                Equipt
              </span>
            </div>
            <p className="mb-4 text-[14px] leading-relaxed text-[#5a5a56]">
              Asset management &amp; maintenance — work orders, PM schedules, and purchasing.
            </p>
            <span className="text-[13px] font-semibold text-[#2aa9e0] group-hover:underline">
              Explore Equipt →
            </span>
          </Link>
        </div>
      </div>

      <FeaturesShowcase />

      {/* OFFICE + FIELD */}
      <Reveal>
        <div className="mx-auto max-w-[1160px] px-6 pb-24 sm:px-12">
          <div className="mb-12 text-center">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
              Office and field
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
              Built for whoever's using it.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-[10px] border border-[#e6e6e0] bg-white shadow-sm">
              <SidebarMockup />
              <div className="border-t border-[#e6e6e0] p-6">
                <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                  One command center for the office
                </div>
                <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">
                  Every module — purchasing, maintenance, reporting, settings — organized in a single sidebar so
                  nothing is more than one click away.
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-[#e6e6e0] bg-white shadow-sm">
              <MobileCrewMockup />
              <div className="border-t border-[#e6e6e0] p-6">
                <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                  A stripped-down app for the field
                </div>
                <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">
                  Crews get a mobile-first stop list with clock-in/out, directions, and photo capture — no sidebar,
                  no clutter, nothing to train them on.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      {/* CATEGORY GRID */}
      <Reveal>
        <div className="mx-auto max-w-[1160px] px-6 pb-16 sm:px-12">
          <div className="mb-12 text-center">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
              More in the platform
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
              Built for the parts other software skips.
            </h2>
          </div>

          <div className="flex flex-col gap-12">
            {CATEGORIES.map((cat) => (
              <div key={cat.label}>
                <div className="mb-5 flex items-baseline gap-2.5">
                  <span className="font-[family-name:var(--font-heading)] text-base font-extrabold text-[#005642]">
                    {cat.label}
                  </span>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {cat.sub}
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  {cat.items.map((f, i) => (
                    <Reveal
                      key={f.title}
                      delayMs={i * 50}
                      className="rounded-md border border-[#e6e6e0] bg-white p-6 transition-shadow hover:shadow-lg"
                    >
                      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md bg-[#eef4e2]">
                        <f.icon className="h-4.5 w-4.5 text-[#60ab45]" />
                      </div>
                      <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                        {f.title}
                      </div>
                      <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">{f.body}</div>
                    </Reveal>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* CLIENT-FACING & INSIGHTS */}
      <Reveal>
        <div className="mx-auto max-w-[1160px] px-6 pb-24 sm:px-12">
          <div className="mb-12 text-center">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
              Client-facing &amp; insights
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
              It&apos;s not just for your team.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-[10px] border border-[#e6e6e0] bg-white shadow-sm">
              <ClientPortalMockup />
              <div className="border-t border-[#e6e6e0] p-6">
                <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                  What your clients see
                </div>
                <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">
                  Clients pay invoices, accept or push back on estimates, and check job status themselves —
                  without a phone call.
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-[10px] border border-[#e6e6e0] bg-white shadow-sm">
              <DashboardBuilderMockup />
              <div className="border-t border-[#e6e6e0] p-6">
                <div className="font-[family-name:var(--font-heading)] mb-2 text-base font-bold text-[#0a0a0a]">
                  Build the dashboard your business needs
                </div>
                <div className="text-[13.5px] leading-relaxed text-[#5a5a56]">
                  Drag and drop charts, KPI tiles, and tables from any report into a dashboard that&apos;s actually
                  yours — not whatever the vendor decided to ship.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            See it running on your own jobs.
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">30-day free trial. No credit card required.</div>
          <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
            <Link href="/signup">Start free trial</Link>
          </Button>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
