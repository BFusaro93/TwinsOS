import { notFound } from "next/navigation";
import { GuideShell } from "@/components/docs/GuideShell";
import { GUIDE_COMPONENTS } from "@/components/docs/guides/registry";

/** Every guide slug, for the [slug] routes' generateStaticParams. */
export function guideStaticParams() {
  return Object.keys(GUIDE_COMPONENTS).map((slug) => ({ slug }));
}

/**
 * Body of the `[slug]` guide route — identical in all three shells, so each
 * route file is just a thin wrapper around this.
 */
export function GuideRoutePage({ slug }: { slug: string }) {
  const Guide = GUIDE_COMPONENTS[slug];
  if (!Guide) notFound();

  return (
    <GuideShell>
      <Guide />
    </GuideShell>
  );
}
