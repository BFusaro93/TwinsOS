import { ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export function RequestsStub() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Requests" description="Service and maintenance requests" />
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-white shadow-sm">
        <EmptyState
          icon={ClipboardList}
          title="Requests coming soon"
          description="Maintenance request management will be available in the next phase."
        />
      </div>
    </div>
  );
}
