import { Gauge } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export function MetersStub() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Meters" description="Equipment hour and mileage meters" />
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-white shadow-sm">
        <EmptyState
          icon={Gauge}
          title="Meters coming soon"
          description="Equipment meter tracking for hour-based PM triggers will be available in the next phase."
        />
      </div>
    </div>
  );
}
