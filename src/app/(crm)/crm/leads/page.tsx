"use client";

import { useState } from "react";
import { Plus, Minimize2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { LeadsList } from "@/components/crm/leads/LeadsList";
import { LeadsListView } from "@/components/crm/leads/LeadsListView";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { useLeads, useBulkImportLeads } from "@/lib/hooks/use-clients";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Client } from "@/types/crm";

const LEAD_TEMPLATE_COLUMNS = [
  "displayName", "accountType", "primaryPhone", "primaryEmail",
  "billingAddress", "billingCity", "billingState", "billingZip", "source",
];

export default function LeadsPage() {
  const { data: leads } = useLeads();
  const { mutateAsync: bulkImportLeads } = useBulkImportLeads();
  const [viewMode, setViewMode] = useState<"table" | "list">("list");
  const [newOpen, setNewOpen] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);

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
            <ImportExportMenu
              entityLabel="Leads"
              templateColumns={LEAD_TEMPLATE_COLUMNS}
              templateFilename="leads-template.csv"
              requiredColumns={["displayName"]}
              onExport={() =>
                exportCSV(
                  (leads ?? []).map((c) => ({
                    displayName: c.displayName,
                    accountType: c.accountType,
                    primaryPhone: c.primaryPhone ?? "",
                    primaryEmail: c.primaryEmail ?? "",
                    billingAddress: c.billingAddress ?? "",
                    billingCity: c.billingCity ?? "",
                    billingState: c.billingState ?? "",
                    billingZip: c.billingZip ?? "",
                    source: c.source ?? "",
                  })),
                  "leads-export.csv"
                )
              }
              onImport={async (rows) => {
                const { created, matched, skipped } = await bulkImportLeads(rows);
                const parts = [`${created} new lead${created !== 1 ? "s" : ""} created`];
                if (matched > 0) parts.push(`${matched} matched to existing client${matched !== 1 ? "s" : ""}`);
                if (skipped > 0) parts.push(`${skipped} row${skipped !== 1 ? "s" : ""} skipped (missing display name)`);
                toast[skipped > 0 ? "warning" : "success"](parts.join(", ") + ".");
              }}
            />
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Lead
            </Button>
          </div>
        }
      />

      <div className="flex-1 overflow-hidden">
        {viewMode === "table" ? (
          <LeadsList
            newDialogOpen={newOpen}
            onNewDialogOpenChange={setNewOpen}
            onSelect={(lead) => { setSelected(lead); setViewMode("list"); }}
          />
        ) : (
          <LeadsListView
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onBack={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}
