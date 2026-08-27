import { DocsFontScope, DocsHero } from "@/components/docs/DocsBrand";
import { GuideGrid } from "@/components/docs/GuideGrid";

export default function GuideLibraryPage() {
  return (
    <DocsFontScope className="flex flex-col gap-8 pb-12">
      <DocsHero
        kicker="Documentation"
        title="The Guide Library"
        description="Every full-length guide in one place. Open any guide and click Download PDF to save your own copy."
        hideDownload
      />
      <GuideGrid />
    </DocsFontScope>
  );
}
