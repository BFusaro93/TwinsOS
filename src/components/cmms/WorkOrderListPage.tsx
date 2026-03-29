"use client";

import { useState } from "react";
import {
  CalendarClock,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WorkOrderListPanel } from "./WorkOrderListPanel";
import { WorkOrderDetailPanel } from "./WorkOrderDetailPanel";
import { NewWorkOrderDialog } from "./NewWorkOrderDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkOrders } from "@/lib/hooks/use-work-orders";
import { useCMMSStore } from "@/stores";
import { useSort } from "@/lib/hooks/use-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { WO_STATUS_LABELS, WO_PRIORITY_LABELS } from "@/lib/constants";
import { cn, formatDate, matchesFilter } from "@/lib/utils";
import type { WorkOrder, WorkOrderStatus, WorkOrderPriority } from "@/types";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = (Object.keys(WO_STATUS_LABELS) as WorkOrderStatus[]).map((k) => ({
  value: k,
  label: WO_STATUS_LABELS[k],
}));

const PRIORITY_OPTIONS = (Object.keys(WO_PRIORITY_LABELS) as WorkOrderPriority[]).map((k) => ({
  value: k,
  label: WO_PRIORITY_LABELS[k],
}));

const WO_TYPE_OPTIONS = [
  { value: "reactive",   label: "Reactive" },
  { value: "preventive", label: "Preventive" },
];

const WO_RECURRING_OPTIONS = [
  { value: "yes", label: "Recurring" },
  { value: "no",  label: "Non-recurring" },
];

const WO_COLUMNS: ColumnDef[] = [
  { key: "workOrderNumber", label: "WO #",           locked: true },
  { key: "title",           label: "Title",           locked: true },
  { key: "status",          label: "Status" },
  { key: "priority",        label: "Priority" },
  { key: "woType",          label: "Type" },
  { key: "assetName",       label: "Asset / Vehicle" },
  { key: "assignedToName",  label: "Assigned To" },
  { key: "category",        label: "Category" },
  { key: "dueDate",         label: "Due Date" },
];

const RECURRENCE_LABELS: Record<string, string> = {
  daily:     "Daily",
  weekly:    "Weekly",
  biweekly:  "Bi-weekly",
  monthly:   "Monthly",
  quarterly: "Quarterly",
  yearly:    "Yearly",
};

const RECURRENCE_COLORS: Record<string, string> = {
  daily:     "border-orange-200 bg-orange-50 text-orange-700",
  weekly:    "border-blue-200 bg-blue-50 text-blue-700",
  biweekly:  "border-cyan-200 bg-cyan-50 text-cyan-700",
  monthly:   "border-violet-200 bg-violet-50 text-violet-700",
  quarterly: "border-teal-200 bg-teal-50 text-teal-700",
  yearly:    "border-slate-200 bg-slate-100 text-slate-600",
};

// ── Upcoming Maintenance Report ───────────────────────────────────────────────

function RecurrenceBadge({ frequency }: { frequency: string | null }) {
  if (!frequency) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        RECURRENCE_COLORS[frequency] ?? "border-slate-200 bg-slate-100 text-slate-600"
      )}
    >
      <RefreshCw className="h-2.5 w-2.5" />
      {RECURRENCE_LABELS[frequency] ?? frequency}
    </Badge>
  );
}

function SectionHeader({
  label,
  count,
  variant = "default",
}: {
  label: string;
  count: number;
  variant?: "default" | "overdue" | "complete";
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={7}
        className={cn(
          "py-2 pl-4 text-xs font-semibold uppercase tracking-wide",
          variant === "overdue"  && "bg-red-50 text-red-700",
          variant === "complete" && "bg-green-50 text-green-700",
          variant === "default"  && "bg-slate-50 text-slate-500"
        )}
      >
        {label}
        <span className="ml-2 rounded-full border px-1.5 py-0.5 text-[10px] font-medium">
          {count}
        </span>
      </TableCell>
    </TableRow>
  );
}

function UpcomingMaintenanceView({
  workOrders,
  isLoading,
  onRowClick,
}: {
  workOrders: WorkOrder[];
  isLoading: boolean;
  onRowClick: (wo: WorkOrder) => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr   = today.toISOString().split("T")[0];
  const weekOut    = new Date(today.getTime() + 7  * 86400000).toISOString().split("T")[0];
  const monthOut   = new Date(today.getTime() + 30 * 86400000).toISOString().split("T")[0];

  const recurring = workOrders.filter((wo) => wo.isRecurring);
  const active    = recurring.filter((wo) => wo.status !== "done");
  const done      = recurring.filter((wo) => wo.status === "done");

  const byDue = (a: WorkOrder, b: WorkOrder) =>
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");

  const overdue   = active.filter((wo) => wo.dueDate && wo.dueDate < todayStr).sort(byDue);
  const thisWeek  = active.filter((wo) => wo.dueDate && wo.dueDate >= todayStr && wo.dueDate < weekOut).sort(byDue);
  const thisMonth = active.filter((wo) => wo.dueDate && wo.dueDate >= weekOut  && wo.dueDate < monthOut).sort(byDue);
  const later     = active.filter((wo) => wo.dueDate && wo.dueDate >= monthOut).sort(byDue);
  const noDue     = active.filter((wo) => !wo.dueDate);
  const completed = done.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10);

  const totalActive = recurring.filter((wo) => wo.status !== "done").length;

  if (!isLoading && recurring.length === 0) {
    return (
      <EmptyState
        icon={CalendarClock}
        title="No recurring work orders"
        description="Create a work order and set a recurrence to track upcoming maintenance."
      />
    );
  }

  function WORow({ wo, overdue: isOverdue }: { wo: WorkOrder; overdue?: boolean }) {
    return (
      <TableRow
        className="cursor-pointer hover:bg-slate-50"
        onClick={() => onRowClick(wo)}
      >
        <TableCell className="font-mono text-xs text-slate-500">{wo.workOrderNumber}</TableCell>
        <TableCell>
          <p className="font-medium text-slate-900">{wo.title}</p>
          {wo.category && <p className="text-xs text-slate-400">{wo.category}</p>}
        </TableCell>
        <TableCell className="text-sm text-slate-600">{wo.assetName ?? "—"}</TableCell>
        <TableCell>
          <RecurrenceBadge frequency={wo.recurrenceFrequency} />
        </TableCell>
        <TableCell>
          {wo.dueDate ? (
            <span className={cn("text-sm font-medium", isOverdue ? "text-red-600" : "text-slate-700")}>
              {formatDate(wo.dueDate)}
            </span>
          ) : (
            <span className="text-sm text-slate-400">No due date</span>
          )}
        </TableCell>
        <TableCell className="text-sm text-slate-600">
          {wo.assignedToNames.length > 0 ? wo.assignedToNames.join(", ") : (wo.assignedToName ?? "—")}
        </TableCell>
        <TableCell>
          <StatusBadge
            variant={wo.status as Parameters<typeof StatusBadge>[0]["variant"]}
            label={WO_STATUS_LABELS[wo.status]}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3">
        <CalendarClock className="h-5 w-5 shrink-0 text-violet-600" />
        <div>
          <p className="text-sm font-semibold text-violet-900">
            {totalActive} active recurring work order{totalActive !== 1 ? "s" : ""}
            {overdue.length > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {overdue.length} overdue
              </span>
            )}
          </p>
          <p className="text-xs text-violet-700">
            These work orders auto-generate a new copy once marked done.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-24">WO #</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Asset / Vehicle</TableHead>
              <TableHead>Recurrence</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && (
              <>
                {overdue.length > 0 && (
                  <>
                    <SectionHeader label="Overdue" count={overdue.length} variant="overdue" />
                    {overdue.map((wo) => <WORow key={wo.id} wo={wo} overdue />)}
                  </>
                )}

                {thisWeek.length > 0 && (
                  <>
                    <SectionHeader label="Due This Week" count={thisWeek.length} />
                    {thisWeek.map((wo) => <WORow key={wo.id} wo={wo} />)}
                  </>
                )}

                {thisMonth.length > 0 && (
                  <>
                    <SectionHeader label="Due This Month" count={thisMonth.length} />
                    {thisMonth.map((wo) => <WORow key={wo.id} wo={wo} />)}
                  </>
                )}

                {later.length > 0 && (
                  <>
                    <SectionHeader label="Due Later" count={later.length} />
                    {later.map((wo) => <WORow key={wo.id} wo={wo} />)}
                  </>
                )}

                {noDue.length > 0 && (
                  <>
                    <SectionHeader label="No Due Date" count={noDue.length} />
                    {noDue.map((wo) => <WORow key={wo.id} wo={wo} />)}
                  </>
                )}

                {completed.length > 0 && (
                  <>
                    <SectionHeader
                      label="Recently Completed (will recur)"
                      count={completed.length}
                      variant="complete"
                    />
                    {completed.map((wo) => <WORow key={wo.id} wo={wo} />)}
                  </>
                )}

                {recurring.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-slate-400">
                      No recurring work orders found
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorkOrderListPage() {
  const { data: workOrders, isLoading } = useWorkOrders();
  const { selectedWorkOrderId, setSelectedWorkOrderId } = useCMMSStore();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table" | "upcoming">("list");
  const [sheetWOId, setSheetWOId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(WO_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = workOrders ?? [];
  const sheetWO = sheetWOId ? (all.find((wo) => wo.id === sheetWOId) ?? null) : null;

  // Derive filter options from live data
  const assetOptions = Array.from(new Set(all.map((wo) => wo.assetName).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const assigneeOptions = Array.from(new Set(all.flatMap((wo) => wo.assignedToNames.length > 0 ? wo.assignedToNames : (wo.assignedToName ? [wo.assignedToName] : [])).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v, label: v }));

  const categoryOptions = Array.from(new Set(all.map((wo) => wo.category).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const advancedFilters = [
    { key: "status",         placeholder: "All Statuses",          options: STATUS_OPTIONS,       multi: true as const },
    { key: "priority",       placeholder: "All Priorities",        options: PRIORITY_OPTIONS,     multi: true as const },
    { key: "woType",         placeholder: "All Types",             options: WO_TYPE_OPTIONS,      multi: true as const },
    { key: "recurring",      placeholder: "Recurring",             options: WO_RECURRING_OPTIONS, multi: true as const },
    { key: "assetName",      placeholder: "All Assets / Vehicles", options: assetOptions,         multi: true as const },
    { key: "assignedToName", placeholder: "All Assignees",         options: assigneeOptions,      multi: true as const },
    { key: "category",       placeholder: "All Categories",        options: categoryOptions,      multi: true as const },
  ];

  const activeFilterCount = advancedFilters.filter((f) => {
    const v = filterValues[f.key];
    return Array.isArray(v) ? v.length > 0 : !!v && v !== "all";
  }).length;

  function handleFilterChange(key: string, value: string | string[]) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  const filtered = all.filter((wo) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      wo.workOrderNumber.toLowerCase().includes(q) ||
      wo.title.toLowerCase().includes(q) ||
      (wo.assetName ?? "").toLowerCase().includes(q) ||
      (wo.assignedToNames.length > 0 ? wo.assignedToNames.join(" ") : wo.assignedToName ?? "").toLowerCase().includes(q) ||
      (wo.category ?? "").toLowerCase().includes(q);
    const matchStatus    = matchesFilter(wo.status, filterValues.status);
    const matchPriority  = matchesFilter(wo.priority, filterValues.priority);
    const matchType      = matchesFilter(wo.woType ?? "", filterValues.woType);
    const matchRecurring = matchesFilter(wo.isRecurring ? "yes" : "no", filterValues.recurring);
    const matchAsset     = matchesFilter(wo.assetName ?? "", filterValues.assetName);
    const assigneeNames = wo.assignedToNames.length > 0 ? wo.assignedToNames : (wo.assignedToName ? [wo.assignedToName] : []);
    const matchAssignee  = !filterValues.assignedToName?.length || assigneeNames.some((n) => matchesFilter(n, filterValues.assignedToName));
    const matchCategory  = matchesFilter(wo.category ?? "", filterValues.category);
    return matchSearch && matchStatus && matchPriority && matchType && matchRecurring && matchAsset && matchAssignee && matchCategory;
  });

  const { sortKey, sortDir, toggle, sorted } = useSort(filtered, "createdAt", "desc");

  const selectedWO =
    (filtered.find((wo) => wo.id === selectedWorkOrderId) ??
      all.find((wo) => wo.id === selectedWorkOrderId)) ??
    null;

  // ── Shared filter controls ─────────────────────────────────────────────────
  const searchAndFilters = (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        filters={[]}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        searchPlaceholder="Search work orders..."
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
        <Skeleton key={i} className="h-20 rounded-md" />
      ))}
    </div>
  ) : (
    <>
      <div className="border-b p-3">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
      </div>
      <WorkOrderListPanel
        workOrders={filtered}
        selectedId={selectedWorkOrderId}
        onSelect={setSelectedWorkOrderId}
      />
    </>
  );

  // ── Table view ─────────────────────────────────────────────────────────────
  const tableView = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
        <ColumnChooser
          columns={WO_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <SortableTableHead label="WO #" sortKey="workOrderNumber" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTableHead label="Title" sortKey="title" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              {col("status")         && <SortableTableHead label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("priority")       && <SortableTableHead label="Priority" sortKey="priority" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("woType")         && <SortableTableHead label="Type" sortKey="woType" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("assetName")      && <SortableTableHead label="Asset / Vehicle" sortKey="assetName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("assignedToName") && <SortableTableHead label="Assigned To" sortKey="assignedToName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("category")       && <SortableTableHead label="Category" sortKey="category" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("dueDate")        && <SortableTableHead label="Due Date" sortKey="dueDate" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
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
                  <p className="text-sm text-slate-400">No work orders found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && sorted.map((wo) => (
              <TableRow
                key={wo.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetWOId(wo.id)}
              >
                <TableCell className="font-mono text-xs text-slate-500">{wo.workOrderNumber}</TableCell>
                <TableCell className="font-medium">{wo.title}</TableCell>
                {col("status") && (
                  <TableCell>
                    <StatusBadge
                      variant={wo.status as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={WO_STATUS_LABELS[wo.status] ?? wo.status}
                    />
                  </TableCell>
                )}
                {col("priority") && (
                  <TableCell>
                    <StatusBadge
                      variant={wo.priority as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={WO_PRIORITY_LABELS[wo.priority] ?? wo.priority}
                    />
                  </TableCell>
                )}
                {col("woType") && (
                  <TableCell className="text-slate-600">
                    {wo.woType === "reactive"
                      ? "Reactive"
                      : wo.woType === "preventive"
                      ? "Preventive"
                      : "—"}
                  </TableCell>
                )}
                {col("assetName") && (
                  <TableCell className="text-slate-600">{wo.assetName ?? "—"}</TableCell>
                )}
                {col("assignedToName") && (
                  <TableCell className="text-slate-600">
                    {wo.assignedToNames.length > 0 ? wo.assignedToNames.join(", ") : (wo.assignedToName ?? "—")}
                  </TableCell>
                )}
                {col("category") && (
                  <TableCell className="text-slate-600">{wo.category ?? "—"}</TableCell>
                )}
                {col("dueDate") && (
                  <TableCell className="text-slate-500">
                    {wo.dueDate ? formatDate(wo.dueDate) : "—"}
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
        title="Work Orders"
        action={
          <div className="flex items-center gap-2">
            {/* View toggles */}
            <div className="flex items-center rounded-md border bg-white shadow-sm">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-r-none border-r px-3",
                  viewMode === "list" && "bg-slate-100 font-semibold"
                )}
                onClick={() => setViewMode("list")}
              >
                <Minimize2 className="mr-1.5 h-3.5 w-3.5" />
                List
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-none border-r px-3",
                  viewMode === "table" && "bg-slate-100 font-semibold"
                )}
                onClick={() => setViewMode("table")}
              >
                <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
                Table
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "rounded-l-none px-3",
                  viewMode === "upcoming" && "bg-violet-50 font-semibold text-violet-700"
                )}
                onClick={() => setViewMode("upcoming")}
              >
                <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                Upcoming
              </Button>
            </div>

            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Work Order
            </Button>
          </div>
        }
      />

      {viewMode === "list" && (
        <MasterDetailLayout
          listPanel={listPanel}
          detailPanel={selectedWO ? <WorkOrderDetailPanel key={selectedWorkOrderId} workOrder={selectedWO} /> : null}
          emptyState={
            <EmptyState
              icon={Wrench}
              title="Select a work order"
              description="Choose a work order from the list to view its details, asset information, and history."
            />
          }
          hasSelection={!!selectedWO}
          onBack={() => setSelectedWorkOrderId(null)}
        />
      )}

      {viewMode === "table" && tableView}

      {viewMode === "upcoming" && (
        <UpcomingMaintenanceView
          workOrders={all}
          isLoading={isLoading}
          onRowClick={(wo) => setSheetWOId(wo.id)}
        />
      )}

      {/* Detail sheet — used by both table view and upcoming view */}
      <Sheet open={!!sheetWO} onOpenChange={(o) => { if (!o) setSheetWOId(null); }}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]"
        >
          {sheetWO && <WorkOrderDetailPanel workOrder={sheetWO} />}
        </SheetContent>
      </Sheet>

      <NewWorkOrderDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
