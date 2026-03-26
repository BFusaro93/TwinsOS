import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export function PMSchedulesStub() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="PM Schedules" description="Preventive maintenance schedules" />
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-white shadow-sm">
        <EmptyState
          icon={Calendar}
          title="PM Schedules coming soon"
          description="Preventive maintenance scheduling will be available in the next phase."
        />
      </div>
    </div>
  );
}
