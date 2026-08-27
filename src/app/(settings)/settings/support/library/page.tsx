import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DocsFontScope, DocsHero, DocsEyebrow } from "@/components/docs/DocsBrand";
import { groupedDocGuides } from "@/lib/docs-guides";

export default function GuideLibraryPage() {
  const groups = groupedDocGuides();

  return (
    <DocsFontScope className="flex flex-col gap-8 pb-12">
      <DocsHero
        kicker="Documentation"
        title="The Guide Library"
        description="Every full-length guide in one place. Open any guide and click Download PDF to save your own copy."
        hideDownload
      />

      {groups.map((group) => (
        <section key={group.kicker}>
          <DocsEyebrow>{group.kicker}</DocsEyebrow>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.guides.map((guide) => (
              <Link
                key={guide.slug}
                href={`/settings/support/${guide.slug}`}
                className="group flex flex-col gap-1.5 rounded-lg border border-[#e6e6e0] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0a0a0a]">
                    {guide.title}
                  </p>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#60ab45] opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="text-xs leading-relaxed text-[#5a5a56]">{guide.description}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </DocsFontScope>
  );
}
