"use client";

import { useState } from "react";
import { Plus, ClipboardList, Maximize2, Minimize2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { RequestListPanel } from "./RequestListPanel";
import { RequestDetailPanel } from "./RequestDetailPanel";
import { NewRequestDialog } from "./NewRequestDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRequests } from "@/lib/hooks/use-requests";
import { useCMMSStore } from "@/stores";
import { useSort } from "@/lib/hooks/use-sort";
import { REQUEST_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, matchesFilter } from "@/lib/utils";
import type { MaintenanceRequestStatus, WorkOrderPriority } from "@/types";

const STATUS_OPTIONS = (
  Object.keys(REQUEST_STATUS_LABELS) as MaintenanceRequestStatus[]
).map((k) => ({ value: k, label: REQUEST_STATUS_LABELS[k] }));

const PRIORITY_OPTIONS = (Object.keys(WO_PRIORITY_LABELS) as WorkOrderPriority[]).map(
  (k) => ({ value: k, label: WO_PRIORITY_LABELS[k] })
);

const REQUEST_COLUMNS: ColumnDef[] = [
  { key: "requestNumber", label: "Request #", locked: true },
  { key: "title", label: "Title", locked: true },
  { key: "status", label: "Status" },
  { key: "priority", label: "Priority" },
  { key: "requestedByName", label: "Submitted By" },
  { key: "assetName", label: "Asset" },
  { key: "createdAt", label: "Date" },
  { key: "linkedWorkOrderNumber", label: "Work Order" },
];

export function RequestListPage() {
  const { data: requests, isLoading } = useRequests();
  const { selectedRequestId, setSelectedRequestId } = useCMMSStore();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [sheetRequestId, setSheetRequestId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(REQUEST_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = requests ?? [];
  const sheetRequest = sheetRequestId ? (all.find((r) => r.id === sheetRequestId) ?? null) : null;

  const advancedFilters = [
    { key: "status", placeholder: "All Statuses", options: STATUS_OPTIONS, multi: true as const },
    { key: "priority", placeholder: "All Priorities", options: PRIORITY_OPTIONS, multi: true as const },
  ];

  const activeFilterCount = advancedFilters.filter((f) => {
    const v = filterValues[f.key];
    return Array.isArray(v) ? v.length > 0 : !!v && v !== "all";
  }).length;

  function handleFilterChange(key: string, value: string | string[]) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = all.filter((req) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      req.requestNumber.toLowerCase().includes(q) ||
      req.title.toLowerCase().includes(q) ||
      req.requestedByName.toLowerCase().includes(q) ||
      (req.assetName ?? "").toLowerCase().includes(q);
    const matchStatus = matchesFilter(req.status, filterValues.status);
    const matchPriority = matchesFilter(req.priority, filterValues.priority);
    return matchSearch && matchStatus && matchPriority;
  });

  const { sortKey, sortDir, toggle, sorted } = useSort(filtered, "createdAt", "desc");

  const selectedRequest = filtered.find((r) => r.id === selectedRequestId) ?? null;

  // ── Shared filter controls ─────────────────────────────────────────────────
  const searchAndFilters = (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        filters={[]}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        searchPlaceholder="Search requests..."
      />
      <AdvancedSearchDialog
        filters={advancedFilters}
        filterValues={filterValues}
        onFilterChange={(key, value) => handleFilterChange(key, value)}
        activeCount={activeFilterCount}
      />
    </>
  );

  // ── List panel ─────────────────────────────────────────────────────────────
  const listPanel = isLoading ? (
    <div className="flex flex-col gap-2 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-md" />
      ))}
    </div>
  ) : (
    <>
      <div className="border-b p-3">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
      </div>
      <RequestListPanel
        requests={filtered}
        selectedId={selectedRequestId}
        onSelect={setSelectedRequestId}
      />
    </>
  );

  // ── Table view ─────────────────────────────────────────────────────────────
  const tableView = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
        <ColumnChooser
          columns={REQUEST_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <SortableTableHead label="Request #" sortKey="requestNumber" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTableHead label="Title" sortKey="title" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              {col("status") && <SortableTableHead label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("priority") && <SortableTableHead label="Priority" sortKey="priority" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("requestedByName") && <SortableTableHead label="Submitted By" sortKey="requestedByName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("assetName") && <SortableTableHead label="Asset" sortKey="assetName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("createdAt") && <SortableTableHead label="Date" sortKey="createdAt" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("linkedWorkOrderNumber") && <SortableTableHead label="Work Order" sortKey="linkedWorkOrderNumber" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: visibleKeys.length }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleKeys.length} className="py-12 text-center">
                  <p className="text-sm text-slate-400">No requests found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && sorted.map((req) => (
              <TableRow
                key={req.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetRequestId(req.id)}
              >
                <TableCell className="font-mono text-xs text-slate-500">{req.requestNumber}</TableCell>
                <TableCell className="font-medium">{req.title}</TableCell>
                {col("status") && (
                  <TableCell>
                    <StatusBadge
                      variant={req.status as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={REQUEST_STATUS_LABELS[req.status] ?? req.status}
                    />
                  </TableCell>
                )}
                {col("priority") && (
                  <TableCell>
                    <StatusBadge
                      variant={req.priority as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={WO_PRIORITY_LABELS[req.priority] ?? req.priority}
                    />
                  </TableCell>
                )}
                {col("requestedByName") && (
                  <TableCell className="text-slate-600">{req.requestedByName}</TableCell>
                )}
                {col("assetName") && (
                  <TableCell className="text-slate-600">{req.assetName ?? "—"}</TableCell>
                )}
                {col("createdAt") && (
                  <TableCell className="text-slate-500">{formatDate(req.createdAt)}</TableCell>
                )}
                {col("linkedWorkOrderNumber") && (
                  <TableCell>
                    {req.linkedWorkOrderNumber ? (
                      <span className="font-mono text-xs text-brand-600">{req.linkedWorkOrderNumber}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Maintenance Requests"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setViewMode(viewMode === "list" ? "table" : "list")}
            >
              {viewMode === "list" ? (
                <><Maximize2 className="h-3.5 w-3.5" />Table view</>
              ) : (
                <><Minimize2 className="h-3.5 w-3.5" />List view</>
              )}
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Request
            </Button>
          </div>
        }
      />

      {viewMode === "list" ? (
        <MasterDetailLayout
          listPanel={listPanel}
          detailPanel={
            selectedRequest ? <RequestDetailPanel key={selectedRequestId} request={selectedRequest} /> : null
          }
          emptyState={
            <EmptyState
              icon={ClipboardList}
              title="Select a request"
              description="Choose a maintenance request to review it, convert it to a work order, or reject it."
            />
          }
          hasSelection={!!selectedRequest}
          onBack={() => setSelectedRequestId(null)}
        />
      ) : (
        tableView
      )}

      {/* Table-mode detail sheet */}
      <Sheet open={!!sheetRequest} onOpenChange={(o) => { if (!o) setSheetRequestId(null); }}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]"
        >
          {sheetRequest && <RequestDetailPanel key={sheetRequest.id} request={sheetRequest} />}
        </SheetContent>
      </Sheet>

      <NewRequestDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
