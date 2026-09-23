import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ChevronRight } from "lucide-react";
import { buildMetadata } from "@/lib/seo";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { GUIDE_COMPONENTS } from "@/components/docs/guides/registry";
import { DOC_GUIDES } from "@/lib/docs-guides";

const heading = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["500", "700", "800"],
  variable: "--font-heading",
});

/**
 * Public, indexable mount of the product guides.
 *
 * The same 37 guide bodies are already mounted in three signed-in shells
 * (/docs, /crm/docs, /settings/support). All three sit behind auth and behind
 * a robots.txt Disallow, so every guide linked from the public /help page
 * answered a logged-out visitor — and Googlebot — with a redirect to /login.
 * This fourth mount is the public one: marketing chrome instead of app chrome,
 * real per-guide metadata, and no auth gate.
 */
export function generateStaticParams() {
  return DOC_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = DOC_GUIDES.find((g) => g.slug === slug);
  if (!guide) return {};

  return buildMetadata({
    title: `${guide.title} | Landscapt & Equipt`,
    description: guide.description,
    path: `/help/${slug}`,
  });
}

export default async function PublicGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = DOC_GUIDES.find((g) => g.slug === slug);
  const Guide = GUIDE_COMPONENTS[slug];
  if (!guide || !Guide) notFound();

  // Other guides in the same category, for a crawlable "keep reading" block.
  const related = DOC_GUIDES.filter((g) => g.kicker === guide.kicker && g.slug !== guide.slug);

  return (
    <div className={`${heading.variable} bg-[#fbfbf8] text-[#0a0a0a]`}>
      <MarketingNav />

      <nav aria-label="Breadcrumb" className="mx-auto max-w-5xl px-6 pt-8 sm:px-12">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-[#4a6b1a]">
          <li>
            <Link href="/help" className="font-semibold hover:underline">
              Support
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9bb37a]" aria-hidden />
          <li className="text-[#0a0a0a]">{guide.title}</li>
        </ol>
      </nav>

      {/*
        Guide bodies root at `h-full ... overflow-y-auto` because their three
        in-app mounts live inside a height-constrained scroll pane. In this
        page's normal document flow that would clip the article, so relax the
        body's own root element rather than editing all 37 guide files.
      */}
      <article className="mx-auto max-w-5xl px-6 py-8 sm:px-12 [&>*]:h-auto [&>*]:overflow-visible">
        <Guide />
      </article>

      {related.length > 0 && (
        <section className="border-t border-[#e6e6e0] bg-white px-6 py-14 sm:px-12">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-[family-name:var(--font-heading)] mb-6 text-2xl font-extrabold text-[#005642]">
              More in {guide.kicker}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((g) => (
                <Link
                  key={g.slug}
                  href={`/help/${g.slug}`}
                  className="rounded-lg border border-[#e6e6e0] bg-[#fbfbf8] p-5 transition-colors hover:border-[#60ab45] hover:bg-[#eef4e2]"
                >
                  <div className="font-[family-name:var(--font-heading)] mb-1.5 text-base font-bold text-[#005642]">
                    {g.title}
                  </div>
                  <div className="text-sm leading-relaxed text-[#4a5568]">{g.description}</div>
                </Link>
              ))}
            </div>
            <Link
              href="/help"
              className="mt-8 inline-block text-sm font-semibold text-[#60ab45] hover:underline"
            >
              Browse all guides
            </Link>
          </div>
        </section>
      )}

      <MarketingFooter />
    </div>
  );
}
