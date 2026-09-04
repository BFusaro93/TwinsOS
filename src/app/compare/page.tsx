import type { Metadata } from "next";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { buildMetadata } from "@/lib/seo";
import { COMPETITORS } from "@/lib/comparisons";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export const metadata: Metadata = buildMetadata({
  title: "Compare Landscapt & Equipt to Other Landscaping Software",
  description: "See how Landscapt & Equipt compares to Service Autopilot, Jobber, LMN, Aspire, Housecall Pro, and Homeworks on estimating, snow ops, and equipment maintenance.",
  path: "/compare",
});

export default function ComparePage() {
  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">Compare</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          How Landscapt &amp; Equipt stacks up.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">
          An honest look at where we fit next to the other landscaping and field-service platforms you're evaluating.
        </p>
      </div>

      <div className="mx-auto max-w-[900px] px-6 py-20 sm:px-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {COMPETITORS.map((c, i) => (
            <Reveal key={c.slug} delayMs={Math.min(i, 4) * 60}>
              <Link
                href={`/compare/${c.slug}`}
                className="group flex h-full flex-col rounded-lg border border-[#e6e6e0] bg-white p-6 transition-colors hover:border-[#60ab45]"
              >
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{c.category}</div>
                <div className="font-[family-name:var(--font-heading)] mb-2 text-lg font-bold text-[#0a0a0a]">
                  Landscapt vs. {c.name}
                </div>
                <p className="mb-4 flex-1 text-[13.5px] leading-relaxed text-[#5a5a56]">{c.tagline}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#005642]">
                  See the comparison
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </Reveal>
          ))}
        </div>

        <p className="mt-12 text-center text-xs text-slate-400">
          Feature and pricing information is drawn from public sources and may change — always confirm current details
          directly with each vendor.
        </p>
      </div>

      <MarketingFooter />
    </div>
  );
}
