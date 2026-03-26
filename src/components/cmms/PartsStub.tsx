import { Package } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export function PartsStub() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Parts Inventory"
        description="Maintenance parts and inventory levels"
      />
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-white shadow-sm">
        <EmptyState
          icon={Package}
          title="Parts Inventory coming soon"
          description="Parts inventory management with low-stock alerts will be available in the next phase. 15 parts loaded."
        />
      </div>
    </div>
  );
}
