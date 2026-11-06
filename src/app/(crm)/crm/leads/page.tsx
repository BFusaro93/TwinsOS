"use client";

import { useState } from "react";
import { Plus, Minimize2, Maximize2, UserSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LeadsList, NewLeadDialog } from "@/components/crm/leads/LeadsList";
import { LeadsListView } from "@/components/crm/leads/LeadsListView";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { PermissionGate } from "@/components/shared/PermissionGate";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { exportCSV } from "@/lib/csv";
import { fetchFilteredClients, leadQueryParams, useBulkImportLeads } from "@/lib/hooks/use-clients";
import type { FilterRow } from "@/lib/client-filters";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Client } from "@/types/crm";

// Shared with Settings → Import / Export so both import the same columns.
import { LEAD_REQUIRED_COLUMNS, LEAD_TEMPLATE_COLUMNS, leadToCsvRow } from "@/lib/crm/import-export-columns";

export default function LeadsPage() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  // Shared by the table and list views (and the CSV export), so switching
  // views keeps the current search and filters.
  const [search, setSearch] = useState("");
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const { mutateAsync: bulkImportLeads } = useBulkImportLeads();
  const [viewMode, setViewMode] = useState<"table" | "list">("list");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);

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

  if (!permissionsLoading && !can("lead_list")) {
    return (
      <EmptyState
        icon={UserSearch}
        title="No access"
        description="You don't have permission to view Leads."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Leads"
        description="Prospective clients — convert to client once an estimate is accepted"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {viewToggle}
            <ImportExportMenu
              entityLabel="Leads"
              templateColumns={LEAD_TEMPLATE_COLUMNS}
              templateFilename="leads-template.csv"
              requiredColumns={LEAD_REQUIRED_COLUMNS}
              onExport={async () => {
                // Exports what the current search + filters match — fetched
                // in full on demand, since the list itself is paged.
                if (exporting) return;
                setExporting(true);
                try {
                  const leads = await fetchFilteredClients(leadQueryParams({ search, filters: filterRows }));
                  exportCSV(
                    leads.map(leadToCsvRow),
                    "leads-export.csv"
                  );
                } catch {
                  toast.error("Export failed");
                } finally {
                  setExporting(false);
                }
              }}
              onImport={async (rows) => {
                const result = await bulkImportLeads(rows);
                const parts = [`${result.created} new lead${result.created !== 1 ? "s" : ""} created`];
                if (result.matched > 0) parts.push(`${result.matched} matched to existing client${result.matched !== 1 ? "s" : ""}`);
                if (result.failed.length > 0) parts.push(`${result.failed.length} row${result.failed.length !== 1 ? "s" : ""} not imported`);
                toast[result.failed.length > 0 ? "warning" : "success"](parts.join(", ") + ".");
                // Returned so the import dialog lists each failed / matched row with its reason.
                return result;
              }}
              hideImport={!can("lead_bulk_create")}
            />
            <PermissionGate permission="lead_add">
              <Button size="sm" onClick={() => setNewOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                New Lead
              </Button>
            </PermissionGate>
          </div>
        }
      />

      {/* Mounted once at page level so the header "New Lead" button works in
          both views — previously it lived inside LeadsList (table view only),
          so in the default List view the click set state nobody rendered. */}
      <NewLeadDialog open={newOpen} onOpenChange={setNewOpen} />

      <div className="flex-1 overflow-hidden">
        {viewMode === "table" ? (
          <LeadsList
            onSelect={(lead) => { setSelected(lead); setViewMode("list"); }}
            search={search}
            onSearchChange={setSearch}
            filterRows={filterRows}
            onFilterRowsChange={setFilterRows}
          />
        ) : (
          <LeadsListView
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onBack={() => setSelected(null)}
            search={search}
            onSearchChange={setSearch}
            filterRows={filterRows}
            onFilterRowsChange={setFilterRows}
          />
        )}
      </div>
    </div>
  );
}
