"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { AutomationsList } from "@/components/crm/automations/AutomationsList";

export default function AutomationsPage() {
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Automations"
        description="Build event-driven sequences that automatically act on your clients."
        action={
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New Automation
          </Button>
        }
      />

      <div className="flex-1 overflow-auto">
        <AutomationsList newDialogOpen={newOpen} onNewDialogOpenChange={setNewOpen} />
      </div>
    </div>
  );
}
