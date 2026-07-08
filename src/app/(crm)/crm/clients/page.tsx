"use client";

import { useState } from "react";
import { Plus, Users, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { EmptyState } from "@/components/shared/EmptyState";
import { ClientList } from "@/components/crm/ClientList";
import { ClientsTable } from "@/components/crm/ClientsTable";
import { ClientDetailPanel } from "@/components/crm/ClientDetailPanel";
import { NewClientDialog } from "@/components/crm/NewClientDialog";
import { cn } from "@/lib/utils";
import type { Client } from "@/types/crm";

export default function ClientsPage() {
  const [selected, setSelected] = useState<Client | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [expanded, setExpanded] = useState(false);

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
        title="Clients"
        description="Manage customer accounts, properties, and activity"
        action={
          <div className="flex items-center gap-2">
            {viewToggle}
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Client
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden">
        {viewMode === "list" ? (
          <MasterDetailLayout
            hasSelection={!!selected}
            expanded={expanded}
            onBack={() => { setSelected(null); setExpanded(false); }}
            listPanel={
              <ClientList selectedId={selected?.id ?? null} onSelect={(c) => { setSelected(c); setExpanded(false); }} />
            }
            detailPanel={selected ? <ClientDetailPanel clientId={selected.id} expanded={expanded} onExpandChange={setExpanded} /> : null}
            emptyState={
              <EmptyState
                icon={Users}
                title="Select a client"
                description="Choose a client from the list to view their profile and activity."
              />
            }
          />
        ) : (
          <ClientsTable
            onSelect={(client) => {
              setSelected(client);
              setViewMode("list");
            }}
          />
        )}
      </div>

      <NewClientDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(client) => { setSelected(client); setViewMode("list"); }}
      />
    </div>
  );
}
