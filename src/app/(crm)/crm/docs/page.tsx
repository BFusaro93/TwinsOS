import { PageHeader } from "@/components/shared/PageHeader";
import { DocsPage } from "@/components/docs/DocsPage";

export default function CRMDocumentationPage() {
  return (
    <div className="flex flex-col gap-6 pb-4">
      <PageHeader
        title="Documentation"
        description="Step-by-step guides for every part of the platform."
      />
      <DocsPage />
    </div>
  );
}
