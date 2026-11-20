import { DocsFontScope, DocsHero } from "@/components/docs/DocsBrand";
import { GuideSidebar } from "@/components/docs/GuideSidebar";
import { GuideGrid } from "@/components/docs/GuideGrid";
import { GUIDE_DOWNLOADS } from "@/lib/guide-downloads";

export default function MasterSettingsDocumentationPage() {
  return (
    <DocsFontScope className="flex h-full min-h-[600px] flex-col gap-6 pb-4">
      <DocsHero
        kicker="Documentation"
        title="Advanced Guides"
        description="Every full-length guide, organized by module. Pick one from the sidebar or browse below."
        hideDownload
      />
      <div className="flex flex-1 min-h-0 overflow-hidden rounded-lg border border-[#e6e6e0] dark:border-border bg-card shadow-sm">
        <aside className="hidden w-80 shrink-0 border-r border-slate-100 dark:border-neutral-800 lg:flex lg:flex-col">
          <GuideSidebar />
        </aside>
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8">
          <div className="mx-auto max-w-3xl">
            <section className="mb-8 rounded-lg border border-[#e6e6e0] dark:border-border p-4">
              <h2 className="mb-1 font-[family-name:var(--font-heading)] text-base font-bold text-[#005642] dark:text-[#9ebfb7]">
                Downloadable overviews
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">Short PDF guides you can save or share with your team.</p>
              <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {GUIDE_DOWNLOADS.map((g) => (
                  <li key={g.slug}>
                    <a href={g.file} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[#005642] hover:underline dark:text-[#9ebfb7]">
                      {g.title} (PDF)
                    </a>
                  </li>
                ))}
              </ul>
            </section>
            <GuideGrid basePath="/settings/support" />
          </div>
        </div>
      </div>
    </DocsFontScope>
  );
}
