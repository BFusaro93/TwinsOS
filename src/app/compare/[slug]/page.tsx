import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Button } from "@/components/ui/button";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { Reveal } from "@/components/marketing/Reveal";
import { CompareTable } from "@/components/marketing/CompareTable";
import { buildMetadata, SITE_URL } from "@/lib/seo";
import { COMPETITORS, getCompetitor } from "@/lib/comparisons";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) return {};
  return buildMetadata({
    title: `${competitor.product} vs. ${competitor.name} | Landscaping Software Comparison`,
    description: `${competitor.tagline} See how ${competitor.product} compares to ${competitor.name} on estimating, snow operations, job costing, and equipment maintenance.`,
    path: `/compare/${competitor.slug}`,
  });
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) notFound();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Compare", item: `${SITE_URL}/compare` },
      { "@type": "ListItem", position: 3, name: competitor.name },
    ],
  };

  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <MarketingNav />

      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">
          {competitor.product} vs. {competitor.name}
        </div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          {competitor.tagline}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">Best for: {competitor.bestFor}</p>
      </div>

      <div className="mx-auto max-w-[820px] px-6 py-16 sm:px-12">
        <Reveal>
          <h2 className="font-[family-name:var(--font-heading)] mb-5 text-2xl font-bold text-[#0a0a0a]">
            At a glance
          </h2>
          <CompareTable rows={competitor.comparisonRows} ourProduct={competitor.product} competitorName={competitor.name} />
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2">
          <Reveal>
            <h3 className="font-[family-name:var(--font-heading)] mb-3 text-lg font-bold text-[#005642]">
              What {competitor.name} does well
            </h3>
            <ul className="flex flex-col gap-2.5 text-[14px] leading-relaxed text-[#5a5a56]">
              {competitor.strengths.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="text-[#60ab45]">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delayMs={60}>
            <h3 className="font-[family-name:var(--font-heading)] mb-3 text-lg font-bold text-slate-600">
              Worth knowing before you switch to it
            </h3>
            <ul className="flex flex-col gap-2.5 text-[14px] leading-relaxed text-[#5a5a56]">
              {competitor.considerations.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="text-slate-400">•</span>
                  {s}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <p className="mt-8 text-xs text-slate-400">{competitor.pricingNote}</p>

        <div className="mt-16">
          <h2 className="font-[family-name:var(--font-heading)] mb-6 text-2xl font-bold text-[#0a0a0a]">
            Why teams switch to {competitor.product}
          </h2>
          <div className="flex flex-col divide-y divide-[#eceae3]">
            {competitor.switchReasons.map((r) => (
              <div key={r.title} className="py-6 first:pt-0">
                <div className="font-[family-name:var(--font-heading)] mb-1.5 text-base font-bold text-[#0a0a0a]">
                  {r.title}
                </div>
                <div className="text-[14.5px] leading-relaxed text-[#5a5a56]">{r.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-[#eef4e2] px-6 py-20 text-center sm:px-12">
        <Reveal>
          <div className="font-[family-name:var(--font-heading)] mb-4 text-3xl font-extrabold text-[#005642]">
            See it running on your own operation.
          </div>
          <div className="mb-8 text-base text-[#4a6b1a]">30-day free trial. No credit card required.</div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-[#60ab45] hover:bg-[#4a8a33]">
              <Link href="/signup">Start free trial</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/compare">See all comparisons</Link>
            </Button>
          </div>
        </Reveal>
      </div>

      <MarketingFooter />
    </div>
  );
}
