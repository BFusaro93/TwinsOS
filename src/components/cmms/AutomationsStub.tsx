import { Zap } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";

export function AutomationsStub() {
  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Automations" description="Automated workflows and triggers" />
      <div className="flex flex-1 items-center justify-center rounded-lg border bg-white shadow-sm">
        <EmptyState
          icon={Zap}
          title="Automations coming soon"
          description="Rule-based automations for work order creation, PM scheduling, and notifications will be available in a future phase."
        />
      </div>
    </div>
  );
}
