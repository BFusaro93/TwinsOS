import { DocsPage } from "@/components/docs/DocsPage";
import { DocsFontScope, DocsHero } from "@/components/docs/DocsBrand";

export default function DocumentationPage() {
  return (
    <DocsFontScope className="flex flex-col gap-6 pb-4">
      <DocsHero
        kicker="Documentation"
        title="Guides for every module."
        description="Step-by-step guides for every part of the platform."
      />
      <DocsPage />
    </DocsFontScope>
  );
}
