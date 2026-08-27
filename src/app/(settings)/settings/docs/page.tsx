import { DocsFontScope, DocsHero } from "@/components/docs/DocsBrand";
import { GuideSidebar } from "@/components/docs/GuideSidebar";
import { GuideGrid } from "@/components/docs/GuideGrid";

export default function MasterSettingsDocumentationPage() {
  return (
    <DocsFontScope className="flex flex-col gap-6 pb-4">
      <DocsHero
        kicker="Documentation"
        title="Advanced Guides"
        description="Every full-length guide, organized by module. Pick one from the sidebar or browse below."
        hideDownload
      />
      <div className="flex h-[75vh] max-h-[900px] min-h-[560px] overflow-hidden rounded-lg border border-[#e6e6e0] bg-white shadow-sm">
        <aside className="hidden w-64 shrink-0 border-r border-slate-100 lg:flex lg:flex-col">
          <GuideSidebar />
        </aside>
        <div className="flex-1 overflow-y-auto px-6 py-8 md:px-8">
          <div className="mx-auto max-w-3xl">
            <GuideGrid />
          </div>
        </div>
      </div>
    </DocsFontScope>
  );
}
