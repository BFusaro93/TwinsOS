import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Zap, CreditCard, FolderKanban, Users, Route, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { FeaturesShowcase } from "@/components/marketing/FeaturesShowcase";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "Features | Landscapt & Equipt",
  description: "Every module in Landscapt & Equipt — dispatch, estimating, work orders, tickets, job photos, automations, and more.",
};

const MORE_FEATURES = [
  {
    icon: Zap,
    title: "Automations",
    body: "One trigger → action engine spans both products — job completed, part low stock, PM due, work order overdue — firing emails, texts, work orders, or requisitions automatically.",
  },
  {
    icon: CreditCard,
    title: "Credit Card & ACH Processing",
    body: "Stripe-powered online payments built into every invoice — clients pay by card or bank transfer, or staff can charge a saved method directly.",
  },
  {
    icon: FolderKanban,
    title: "Projects",
    body: "A dedicated job type for larger landscaping projects, tracked separately from recurring and one-time visits with their own cost rollups.",
  },
  {
    icon: Users,
    title: "Client Portal",
    body: "Clients log in to view and pay invoices, review estimates, and submit their own tickets — without picking up the phone.",
  },
  {
    icon: Boxes,
    title: "Asset Meters & Parts",
    body: "Meter-based PM triggers on hours, mileage, or cycles, plus a parts catalog linked to the assets that use them — with low-stock automation.",
  },
  {
    icon: Route,
    title: "Route Optimization & Mapping",
    body: "Aerial property measurement, automatic job geocoding, and route sequencing to cut drive time between stops.",
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

      <FeaturesShowcase />

      <Reveal>
        <div className="mx-auto max-w-[1160px] px-6 pb-24 sm:px-12">
          <div className="mb-12 text-center">
            <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#60ab45]">
              More in the platform
            </div>
            <h2 className="font-[family-name:var(--font-heading)] text-4xl font-extrabold text-[#005642]">
              Built for the parts other software skips.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {MORE_FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delayMs={i * 60}
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
