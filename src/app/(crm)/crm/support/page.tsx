import { DocsFontScope, DocsHero } from "@/components/docs/DocsBrand";
import { SupportPage } from "@/components/settings/SupportPage";

export default function CRMSupportPage() {
  return (
    <DocsFontScope className="flex flex-col gap-8 pb-12">
      <DocsHero
        kicker="Support"
        title="How can we help?"
        description="Browse guides, search the FAQ, or get in touch with our team."
      />
      <SupportPage docsHref="/crm/docs" />
    </DocsFontScope>
  );
}
