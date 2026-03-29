"use client";

import { useState } from "react";
import { FileText, Maximize2, Minimize2, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { RequisitionListPanel } from "./RequisitionListPanel";
import { RequisitionDetailPanel } from "./RequisitionDetailPanel";
import { NewRequisitionDialog } from "./NewRequisitionDialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useRequisitions } from "@/lib/hooks/use-requisitions";
import { usePOStore } from "@/stores";
import { useSort } from "@/lib/hooks/use-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { APPROVAL_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate, matchesFilter } from "@/lib/utils";
import type { ApprovalStatus, Requisition } from "@/types";

const STATUS_OPTIONS = (Object.keys(APPROVAL_STATUS_LABELS) as ApprovalStatus[]).map((k) => ({
  value: k,
  label: APPROVAL_STATUS_LABELS[k],
}));

const REQ_COLUMNS: ColumnDef[] = [
  { key: "requisitionNumber", label: "Req #",      locked: true },
  { key: "title",             label: "Title",       locked: true },
  { key: "status",            label: "Status" },
  { key: "requestedByName",   label: "Requested By" },
  { key: "vendorName",        label: "Vendor" },
  { key: "lineItems",         label: "Line Items" },
  { key: "grandTotal",        label: "Total" },
  { key: "createdAt",         label: "Created" },
];

export function RequisitionListPage() {
  const { data: requisitions, isLoading } = useRequisitions();
  const { selectedRequisitionId, setSelectedRequisitionId } = usePOStore();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [sheetReqId, setSheetReqId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(REQ_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = requisitions ?? [];
  const sheetReq = sheetReqId ? (all.find((r) => r.id === sheetReqId) ?? null) : null;

  // Derive filter options from live data
  const requesterOptions = Array.from(new Set(all.map((r) => r.requestedByName).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v, label: v }));

  const vendorOptions = Array.from(new Set(all.map((r) => r.vendorName).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const advancedFilters = [
    { key: "status",           placeholder: "All Statuses",   options: STATUS_OPTIONS,   multi: true as const },
    { key: "requestedByName",  placeholder: "All Requesters", options: requesterOptions, multi: true as const },
    { key: "vendorName",       placeholder: "All Vendors",    options: vendorOptions,    multi: true as const },
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
      req.requisitionNumber.toLowerCase().includes(q) ||
      req.title.toLowerCase().includes(q) ||
      req.requestedByName.toLowerCase().includes(q) ||
      (req.vendorName ?? "").toLowerCase().includes(q);
    const matchStatus      = matchesFilter(req.status, filterValues.status);
    const matchRequester   = matchesFilter(req.requestedByName, filterValues.requestedByName);
    const matchVendor      = matchesFilter(req.vendorName ?? "", filterValues.vendorName);
    return matchSearch && matchStatus && matchRequester && matchVendor;
  });

  const { sortKey, sortDir, toggle, sorted } = useSort(filtered, "createdAt", "desc");

  const selectedReq = filtered.find((r) => r.id === selectedRequisitionId) ?? null;

  // ── Shared filter controls ─────────────────────────────────────────────────
  const searchAndFilters = (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        filters={[]}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        searchPlaceholder="Search requisitions..."
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
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-16 rounded-md" />
      ))}
    </div>
  ) : (
    <>
      <div className="border-b p-3">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
      </div>
      <RequisitionListPanel
        requisitions={filtered}
        selectedId={selectedRequisitionId}
        onSelect={setSelectedRequisitionId}
      />
    </>
  );

  // ── Table view ─────────────────────────────────────────────────────────────
  const tableView = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
        <ColumnChooser
          columns={REQ_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <SortableTableHead label="Req #" sortKey="requisitionNumber" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTableHead label="Title" sortKey="title" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              {col("status")          && <SortableTableHead label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("requestedByName") && <SortableTableHead label="Requested By" sortKey="requestedByName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("vendorName")      && <SortableTableHead label="Vendor" sortKey="vendorName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("lineItems")       && <SortableTableHead label="Items" sortKey="lineItems" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="text-right" />}
              {col("grandTotal")      && <SortableTableHead label="Total" sortKey="grandTotal" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="text-right" />}
              {col("createdAt")       && <SortableTableHead label="Created" sortKey="createdAt" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: visibleKeys.length }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleKeys.length} className="py-12 text-center">
                  <p className="text-sm text-slate-400">No requisitions found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && sorted.map((req) => (
              <TableRow
                key={req.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetReqId(req.id)}
              >
                <TableCell className="font-mono text-xs text-slate-500">{req.requisitionNumber}</TableCell>
                <TableCell className="font-medium">{req.title}</TableCell>
                {col("status") && (
                  <TableCell>
                    <StatusBadge
                      variant={req.status as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={APPROVAL_STATUS_LABELS[req.status] ?? req.status}
                    />
                  </TableCell>
                )}
                {col("requestedByName") && (
                  <TableCell className="text-slate-600">{req.requestedByName}</TableCell>
                )}
                {col("vendorName") && (
                  <TableCell className="text-slate-600">{req.vendorName ?? "—"}</TableCell>
                )}
                {col("lineItems") && (
                  <TableCell className="text-right text-slate-600">
                    {req.lineItems.length}
                  </TableCell>
                )}
                {col("grandTotal") && (
                  <TableCell className="text-right font-medium">
                    {formatCurrency(req.grandTotal)}
                  </TableCell>
                )}
                {col("createdAt") && (
                  <TableCell className="text-slate-500">{formatDate(req.createdAt)}</TableCell>
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
        title="Requisitions"
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
              New Requisition
            </Button>
          </div>
        }
      />

      {viewMode === "list" ? (
        <MasterDetailLayout
          listPanel={listPanel}
          detailPanel={selectedReq ? <RequisitionDetailPanel key={selectedReq.id} requisition={selectedReq} /> : null}
          emptyState={
            <EmptyState
              icon={FileText}
              title="Select a requisition"
              description="Choose a requisition to view its details and approval status."
            />
          }
          hasSelection={!!selectedReq}
          onBack={() => setSelectedRequisitionId(null)}
        />
      ) : (
        tableView
      )}

      {/* Table-mode detail sheet */}
      <Sheet open={!!sheetReq} onOpenChange={(o) => { if (!o) setSheetReqId(null); }}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]"
        >
          {sheetReq && <RequisitionDetailPanel key={sheetReq.id} requisition={sheetReq} />}
        </SheetContent>
      </Sheet>

      <NewRequisitionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
