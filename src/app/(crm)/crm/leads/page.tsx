"use client";

import { useState } from "react";
import { Plus, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { LeadsList } from "@/components/crm/leads/LeadsList";
import { LeadsListView } from "@/components/crm/leads/LeadsListView";
import { cn } from "@/lib/utils";

export default function LeadsPage() {
  const [viewMode, setViewMode] = useState<"table" | "list">("table");
  const [newOpen, setNewOpen] = useState(false);

  const viewToggle = (
    <div className="flex items-center rounded-md border bg-white shadow-sm">
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-r-none border-r px-3", viewMode === "list" && "bg-slate-100 font-semibold")}
        onClick={() => setViewMode("list")}
      >
        <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
        List
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-l-none px-3", viewMode === "table" && "bg-slate-100 font-semibold")}
        onClick={() => setViewMode("table")}
      >
        <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
        Table
      </Button>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Prospective clients — convert to client once an estimate is accepted"
        action={
          <div className="flex items-center gap-2">
            {viewToggle}
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Lead
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden">
        {viewMode === "table" ? (
          <LeadsList newDialogOpen={newOpen} onNewDialogOpenChange={setNewOpen} />
        ) : (
          <LeadsListView />
        )}
      </div>
    </div>
  );
}
