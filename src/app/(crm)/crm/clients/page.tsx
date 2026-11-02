"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { fetchClientAccountNumbers, fetchFilteredClients, useBulkImportClients } from "@/lib/hooks/use-clients";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Client } from "@/types/crm";
import type { FilterRow } from "@/lib/client-filters";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { PermissionGate } from "@/components/shared/PermissionGate";

// status, clientSince, names, billing email, notes, tags (separate with |) and the parent's
// account number make a Service Autopilot export — and our own export — round-trip intact.
const CLIENT_TEMPLATE_COLUMNS = [
  "displayName", "firstName", "lastName", "accountType", "status", "clientSince",
  "primaryPhone", "primaryEmail", "billingEmail",
  "billingAddress", "billingCity", "billingState", "billingZip",
  "serviceAddress", "serviceCity", "serviceState", "serviceZip",
  "source", "accountNumber", "parentAccountNumber", "tags", "notesToCrew",
];

// useSearchParams (for ?status= dashboard deep-links) needs a Suspense boundary.
export default function ClientsPage() {
  return (
    <Suspense>
      <ClientsPageInner />
    </Suspense>
  );
}

function ClientsPageInner() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  // ?status=active (My Day's "Active Clients" card) pre-applies a Status
  // filter row in both the list and table views; it stays removable.
  const statusParam = useSearchParams().get("status");
  const initialFilterRows = useMemo<FilterRow[]>(
    () => (statusParam ? [{ id: "url-status", field: "status", operator: "eq", value: statusParam }] : []),
    [statusParam]
  );
  // Shared by the list and table views (and the CSV export), so switching
  // views keeps the current search and filters.
  const [search, setSearch] = useState("");
  const [filterRows, setFilterRows] = useState<FilterRow[]>(initialFilterRows);
  const [exporting, setExporting] = useState(false);
  const { mutateAsync: bulkImportClients } = useBulkImportClients();
  const [selected, setSelected] = useState<Client | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [expanded, setExpanded] = useState(false);

  const viewToggle = (
    <div className="flex items-center rounded-md border bg-card shadow-sm">
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-r-none border-r px-3", viewMode === "list" && "bg-muted font-semibold")}
        onClick={() => setViewMode("list")}
      >
        <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
        List
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-l-none px-3", viewMode === "table" && "bg-muted font-semibold")}
        onClick={() => setViewMode("table")}
      >
        <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
        Table
      </Button>
    </div>
  );

  if (!permissionsLoading && !can("client_list")) {
    return (
      <EmptyState
        icon={Users}
        title="No access"
        description="You don't have permission to view Clients."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Clients"
        description="Manage customer accounts, properties, and activity"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {viewToggle}
            <ImportExportMenu
              entityLabel="Clients"
              templateColumns={CLIENT_TEMPLATE_COLUMNS}
              templateFilename="clients-template.csv"
              requiredColumns={["displayName"]}
              onExport={async () => {
                // Exports what the current search + filters match — fetched
                // in full on demand, since the list itself is paged.
                if (exporting) return;
                setExporting(true);
                try {
                  const clients = await fetchFilteredClients({ search, filters: filterRows });
                  const accountById = new Map(clients.map((c) => [c.id, c.accountNumber ?? ""]));
                  // A parent the filters left out still needs its account # for round-tripping.
                  const missingParents = Array.from(new Set(
                    clients.map((c) => c.parentClientId).filter((id): id is string => !!id && !accountById.has(id))
                  ));
                  if (missingParents.length > 0) {
                    for (const [id, acct] of await fetchClientAccountNumbers(missingParents)) accountById.set(id, acct);
                  }
                  exportCSV(
                    clients.map((c) => ({
                      displayName: c.displayName,
                      firstName: c.firstName ?? "",
                      lastName: c.lastName ?? "",
                      accountType: c.accountType,
                      status: c.status,
                      clientSince: c.clientSince ?? "",
                      primaryPhone: c.primaryPhone ?? "",
                      primaryEmail: c.primaryEmail ?? "",
                      billingEmail: c.billingEmail ?? "",
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
                      parentAccountNumber: c.parentClientId ? accountById.get(c.parentClientId) ?? "" : "",
                      tags: (c.tags ?? []).join("|"),
                      notesToCrew: c.notesToCrew ?? "",
                    })),
                    "clients-export.csv"
                  );
                } catch {
                  toast.error("Export failed");
                } finally {
                  setExporting(false);
                }
              }}
              onImport={async (rows) => {
                const result = await bulkImportClients(rows);
                const { succeeded, failed } = result;
                if (failed.length > 0) {
                  toast.warning(
                    `Imported ${succeeded} client${succeeded !== 1 ? "s" : ""}. ${failed.length} row${failed.length !== 1 ? "s" : ""} failed — see details below.`
                  );
                } else {
                  toast.success(`Successfully imported ${succeeded} client${succeeded !== 1 ? "s" : ""}.`);
                }
                return result;
              }}
              hideImport={!can("client_bulk_create")}
            />
            <PermissionGate permission="client_add">
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Client
              </Button>
            </PermissionGate>
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
              <ClientList
                selectedId={selected?.id ?? null}
                onSelect={(c) => { setSelected(c); setExpanded(false); }}
                search={search}
                onSearchChange={setSearch}
                filterRows={filterRows}
                onFilterRowsChange={setFilterRows}
              />
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
            search={search}
            onSearchChange={setSearch}
            filterRows={filterRows}
            onFilterRowsChange={setFilterRows}
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
