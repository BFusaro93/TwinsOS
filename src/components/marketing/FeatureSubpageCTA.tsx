import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/Reveal";
import { getGuideDownload } from "@/lib/guide-downloads";

export function FeatureSubpageCTA({
  backHref = "/features/landscapt",
  backLabel = "Back to Landscapt overview",
  guideSlug,
}: {
  backHref?: string;
  backLabel?: string;
  /** Slug from guide-downloads.ts; adds a "Download the overview" button. */
  guideSlug?: string;
} = {}) {
  const guide = guideSlug ? getGuideDownload(guideSlug) : undefined;
  return (
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
            <Link href={backHref}>{backLabel}</Link>
          </Button>
          {guide && (
            <Button asChild size="lg" variant="outline">
              <a href={guide.file} target="_blank" rel="noopener noreferrer">
                Download the overview (PDF)
              </a>
            </Button>
          )}
        </div>
      </Reveal>
    </div>
  );
}
