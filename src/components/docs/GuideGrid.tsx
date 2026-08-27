import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DocsEyebrow } from "@/components/docs/DocsBrand";
import { groupedDocGuides } from "@/lib/docs-guides";

/** Grouped card grid of every advanced guide — used on the Docs landing pages and the standalone guide library. */
export function GuideGrid() {
  const groups = groupedDocGuides();

  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.kicker}>
          <DocsEyebrow>{group.kicker}</DocsEyebrow>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {group.guides.map((guide) => {
              const Icon = guide.icon;
              return (
                <Link
                  key={guide.slug}
                  href={`/settings/support/${guide.slug}`}
                  className="group flex items-start gap-3 rounded-lg border border-[#e6e6e0] bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eef4e2]">
                    <Icon className="h-4 w-4 text-[#60ab45]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-[family-name:var(--font-heading)] text-sm font-bold text-[#0a0a0a]">
                        {guide.title}
                      </p>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[#60ab45] opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                    <p className="text-xs leading-relaxed text-[#5a5a56]">{guide.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
