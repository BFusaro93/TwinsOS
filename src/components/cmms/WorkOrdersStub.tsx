import { Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";

export function WorkOrdersStub() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Work Orders"
        description="Track and manage maintenance tasks"
        action={<Button size="sm" disabled>+ New Work Order</Button>}
      />
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-white shadow-sm">
        <EmptyState
          icon={Wrench}
          title="Work Orders coming soon"
          description="Full CMMS work order management will be available in the next phase. Mock data is loaded and ready."
          action={<Button variant="outline" disabled>Get Notified</Button>}
        />
      </div>
    </div>
  );
}
