import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BrowserFrame } from "@/components/marketing/mockups/BrowserFrame";
import { SITE_URL } from "@/lib/seo";

export function FeatureSubpageHero({
  kicker,
  title,
  subhead,
  mockupTab,
  Mockup,
  chrome = "browser",
  backHref = "/features/landscapt",
  backLabel = "Explore Landscapt",
}: {
  kicker: string;
  title: string;
  subhead: string;
  mockupTab?: string;
  Mockup: React.ComponentType;
  /** "browser" wraps the mockup in browser chrome (default); "none" renders it as-is — use for a mockup that already supplies its own frame, like a phone mockup. */
  chrome?: "browser" | "none";
  backHref?: string;
  backLabel?: string;
}) {
  const sectionName = backHref.endsWith("/equipt") ? "Equipt" : "Landscapt";
  // kicker is "<Section> — <Page label>" (or just "<Page label>") — use the
  // short label for the breadcrumb rather than the full marketing headline.
  const pageLabel = kicker.includes("—") ? kicker.split("—").pop()!.trim() : kicker;
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Features", item: `${SITE_URL}/features` },
      { "@type": "ListItem", position: 3, name: sectionName, item: `${SITE_URL}${backHref}` },
      { "@type": "ListItem", position: 4, name: pageLabel },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <div className="bg-[#005642] px-6 py-16 text-center sm:px-12">
        <div className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-[#b7d433]">{kicker}</div>
        <h1 className="mx-auto max-w-2xl font-[family-name:var(--font-heading)] text-4xl font-extrabold text-white sm:text-5xl">
          {title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-base text-[#cfe6d8]">{subhead}</p>
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
            <Link href={backHref}>{backLabel} &rarr;</Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1040px] px-6 py-20 sm:px-12">
        {chrome === "none" ? (
          <Mockup />
        ) : (
          <BrowserFrame tabs={[mockupTab ?? ""]} activeTab={mockupTab ?? ""}>
            <Mockup />
          </BrowserFrame>
        )}
      </div>
    </>
  );
}
