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
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { useClients, useBulkImportClients } from "@/lib/hooks/use-clients";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Client } from "@/types/crm";

const CLIENT_TEMPLATE_COLUMNS = [
  "displayName", "accountType", "primaryPhone", "primaryEmail",
  "billingAddress", "billingCity", "billingState", "billingZip",
  "serviceAddress", "serviceCity", "serviceState", "serviceZip",
  "source", "accountNumber",
];

export default function ClientsPage() {
  const { data: clients } = useClients();
  const { mutateAsync: bulkImportClients } = useBulkImportClients();
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
            <ImportExportMenu
              entityLabel="Clients"
              templateColumns={CLIENT_TEMPLATE_COLUMNS}
              templateFilename="clients-template.csv"
              requiredColumns={["displayName"]}
              onExport={() =>
                exportCSV(
                  (clients ?? []).map((c) => ({
                    displayName: c.displayName,
                    accountType: c.accountType,
                    primaryPhone: c.primaryPhone ?? "",
                    primaryEmail: c.primaryEmail ?? "",
                    billingAddress: c.billingAddress ?? "",
                    billingCity: c.billingCity ?? "",
                    billingState: c.billingState ?? "",
                    billingZip: c.billingZip ?? "",
                    serviceAddress: c.serviceAddress ?? "",
                    serviceCity: c.serviceCity ?? "",
                    serviceState: c.serviceState ?? "",
                    serviceZip: c.serviceZip ?? "",
                    source: c.source ?? "",
                    accountNumber: c.accountNumber ?? "",
                  })),
                  "clients-export.csv"
                )
              }
              onImport={async (rows) => {
                const { inserted, skipped } = await bulkImportClients(rows);
                if (skipped > 0) {
                  toast.warning(
                    `Imported ${inserted} client${inserted !== 1 ? "s" : ""}. ${skipped} row${skipped !== 1 ? "s" : ""} skipped (missing display name).`
                  );
                } else {
                  toast.success(`Successfully imported ${inserted} client${inserted !== 1 ? "s" : ""}.`);
                }
              }}
            />
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
