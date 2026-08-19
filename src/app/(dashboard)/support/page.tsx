import { PageHeader } from "@/components/shared/PageHeader";
import { SupportPage } from "@/components/settings/SupportPage";

export default function EquiptSupportPage() {
  return (
    <div className="flex flex-col gap-8 pb-12">
      <PageHeader
        title="Support"
        description="Browse guides, search the FAQ, or get in touch with our team."
      />
      <SupportPage />
    </div>
  );
}
