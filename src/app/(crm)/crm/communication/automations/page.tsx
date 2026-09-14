"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, History, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { AutomationsList } from "@/components/crm/automations/AutomationsList";
import { PendingApprovalsButton } from "@/components/crm/automations/PendingApprovalsButton";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";

export default function AutomationsPage() {
  const [newOpen, setNewOpen] = useState(false);
  const { can, isLoading: permissionsLoading } = usePermissions();

  if (!permissionsLoading && !can("automation_view")) {
    return (
      <EmptyState
        icon={Zap}
        title="No access"
        description="You don't have permission to view Automations."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Automations"
        description="Build event-driven sequences that automatically act on your clients."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/crm/communication/automations/activity">
                <History className="h-4 w-4" />
                Activity
              </Link>
            </Button>
            <PendingApprovalsButton />
            {can("automation_create_modify") && (
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Automation
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 overflow-auto">
        <AutomationsList newDialogOpen={newOpen} onNewDialogOpenChange={setNewOpen} />
      </div>
    </div>
  );
}
