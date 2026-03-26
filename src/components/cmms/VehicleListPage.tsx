"use client";

import { useState } from "react";
import {
  ClipboardCheck,
  Droplets,
  FileCheck,
  Maximize2,
  Minimize2,
  Plus,
  ScanLine,
  Truck,
} from "lucide-react";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarcodeScanModal } from "@/components/shared/BarcodeScanModal";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { VehicleListPanel } from "./VehicleListPanel";
import { VehicleDetailPanel } from "./VehicleDetailPanel";
import { NewVehicleDialog } from "./NewVehicleDialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useVehicles, useBulkImportVehicles } from "@/lib/hooks/use-vehicles";
import { useCMMSStore } from "@/stores";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { cn, formatDate, matchesFilter } from "@/lib/utils";
import type { Vehicle } from "@/types";

// ── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const VEHICLE_COLUMNS: ColumnDef[] = [
  { key: "icon",            label: "Icon",          locked: true },
  { key: "name",            label: "Name",          locked: true },
  { key: "assetTag",        label: "Asset Tag" },
  { key: "equipmentNumber", label: "Equipment #" },
  { key: "make",            label: "Make" },
  { key: "model",           label: "Model" },
  { key: "year",            label: "Year" },
  { key: "licensePlate",    label: "License Plate" },
  { key: "division",        label: "Division" },
  { key: "assignedCrew",    label: "Assigned Crew" },
  { key: "fuelType",        label: "Fuel Type" },
  { key: "status",          label: "Status" },
];

// ── Service Reminders Report ──────────────────────────────────────────────────

type ServiceBucket = "overdue" | "due-soon" | "ok" | "untracked";

/** Returns the worst-case urgency across ALL reminders for a vehicle. */
function getVehicleBucket(v: Vehicle): ServiceBucket {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr  = today.toISOString().split("T")[0];
  const monthOut  = new Date(today.getTime() + 30 * 86400000).toISOString().split("T")[0];

  const tracked = [v.nextOilChangeDue, v.nextInspectionStickerDue].filter(Boolean) as string[];
  if (tracked.length === 0) return "untracked";
  if (tracked.some((d) => d < todayStr)) return "overdue";
  if (tracked.some((d) => d < monthOut)) return "due-soon";
  return "ok";
}

function dateCell(dateStr: string | null, mileage?: number | null): React.ReactNode {
  if (!dateStr && !mileage) return <span className="text-slate-300">—</span>;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];
  const monthOut = new Date(today.getTime() + 30 * 86400000).toISOString().split("T")[0];

  const dateColor = dateStr
    ? dateStr < todayStr
      ? "text-red-600"
      : dateStr < monthOut
        ? "text-amber-600"
        : "text-green-700"
    : "text-slate-500";

  const daysLabel = (() => {
    if (!dateStr) return null;
    const diff = Math.floor((new Date(dateStr).getTime() - today.getTime()) / 86400000);
    if (diff < 0)  return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return "Today";
    if (diff <= 30) return `${diff}d`;
    return null;
  })();

  return (
    <div className="flex flex-col gap-0.5">
      {dateStr && (
        <span className={cn("text-sm font-medium", dateColor)}>
          {formatDate(dateStr)}
          {daysLabel && (
            <span className="ml-1.5 text-xs font-normal opacity-75">({daysLabel})</span>
          )}
        </span>
      )}
      {mileage != null && (
        <span className="text-xs text-slate-500">{mileage.toLocaleString()} mi</span>
      )}
    </div>
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
        colSpan={6}
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

function ServiceRemindersView({
  vehicles,
  isLoading,
  onRowClick,
}: {
  vehicles: Vehicle[];
  isLoading: boolean;
  onRowClick: (v: Vehicle) => void;
}) {
  // Only include vehicles that have at least one reminder set
  const tracked    = vehicles.filter((v) => getVehicleBucket(v) !== "untracked");
  const untracked  = vehicles.filter((v) => getVehicleBucket(v) === "untracked");
  const overdue    = tracked.filter((v) => getVehicleBucket(v) === "overdue");
  const dueSoon    = tracked.filter((v) => getVehicleBucket(v) === "due-soon");
  const upToDate   = tracked.filter((v) => getVehicleBucket(v) === "ok");

  const overdueCount = overdue.length;

  if (!isLoading && vehicles.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No service reminders"
        description="Open a vehicle and set oil change or inspection sticker due dates to start tracking."
      />
    );
  }

  function VehicleRow({ v }: { v: Vehicle }) {
    return (
      <TableRow className="cursor-pointer hover:bg-slate-50" onClick={() => onRowClick(v)}>
        <TableCell>
          <p className="font-medium text-slate-900">{v.name}</p>
          <p className="text-xs text-slate-400">{v.licensePlate ?? v.assetTag}</p>
        </TableCell>
        <TableCell className="font-mono text-xs text-slate-500">{v.assetTag}</TableCell>
        <TableCell className="text-sm text-slate-600">{v.assignedCrew ?? "—"}</TableCell>
        <TableCell>
          {v.nextOilChangeDue || v.nextOilChangeMileage != null
            ? dateCell(v.nextOilChangeDue, v.nextOilChangeMileage)
            : <span className="text-slate-300">—</span>}
        </TableCell>
        <TableCell>
          {v.nextInspectionStickerDue
            ? dateCell(v.nextInspectionStickerDue)
            : <span className="text-slate-300">—</span>}
        </TableCell>
        <TableCell>
          <StatusBadge
            variant={v.status as Parameters<typeof StatusBadge>[0]["variant"]}
            label={ASSET_STATUS_LABELS[v.status] ?? v.status}
          />
        </TableCell>
      </TableRow>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Summary bar */}
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <ClipboardCheck className="h-5 w-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-semibold text-amber-900">
            {tracked.length} vehicle{tracked.length !== 1 ? "s" : ""} tracked
            {overdueCount > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                {overdueCount} overdue
              </span>
            )}
            {dueSoon.length > 0 && (
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {dueSoon.length} due within 30 days
              </span>
            )}
          </p>
          <p className="text-xs text-amber-700">
            Click any row to open the vehicle and reset a reminder.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Vehicle</TableHead>
              <TableHead>Asset Tag</TableHead>
              <TableHead>Assigned Crew</TableHead>
              <TableHead>
                <span className="flex items-center gap-1.5">
                  <Droplets className="h-3.5 w-3.5 text-slate-400" />
                  Oil Change Due
                </span>
              </TableHead>
              <TableHead>
                <span className="flex items-center gap-1.5">
                  <FileCheck className="h-3.5 w-3.5 text-slate-400" />
                  Inspection Sticker Due
                </span>
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading &&
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && (
              <>
                {overdue.length > 0 && (
                  <>
                    <SectionHeader label="Overdue" count={overdue.length} variant="overdue" />
                    {overdue.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}

                {dueSoon.length > 0 && (
                  <>
                    <SectionHeader label="Due Within 30 Days" count={dueSoon.length} />
                    {dueSoon.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}

                {upToDate.length > 0 && (
                  <>
                    <SectionHeader label="Up to Date" count={upToDate.length} variant="complete" />
                    {upToDate.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}

                {untracked.length > 0 && (
                  <>
                    <SectionHeader label="Not Tracked" count={untracked.length} />
                    {untracked.map((v) => <VehicleRow key={v.id} v={v} />)}
                  </>
                )}

                {vehicles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-slate-400">
                      No vehicles found
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

export function VehicleListPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const { mutateAsync: bulkImportVehicles } = useBulkImportVehicles();
  const { selectedVehicleId, setSelectedVehicleId } = useCMMSStore();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string | string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table" | "service">("list");
  const [sheetVehicle, setSheetVehicle] = useState<Vehicle | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(VEHICLE_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = vehicles ?? [];

  // Derive filter options from live data
  const makeOptions = Array.from(new Set(all.map((v) => v.make).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const divisionOptions = Array.from(new Set(all.map((v) => v.division).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const fuelTypeOptions = Array.from(new Set(all.map((v) => v.fuelType).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const crewOptions = Array.from(new Set(all.map((v) => v.assignedCrew).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const advancedFilters = [
    { key: "status",       placeholder: "All Statuses",   options: STATUS_OPTIONS,   multi: true as const },
    { key: "make",         placeholder: "All Makes",      options: makeOptions,      multi: true as const },
    { key: "division",     placeholder: "All Divisions",  options: divisionOptions,  multi: true as const },
    { key: "fuelType",     placeholder: "All Fuel Types", options: fuelTypeOptions,  multi: true as const },
    { key: "assignedCrew", placeholder: "All Crews",      options: crewOptions,      multi: true as const },
  ];

  const activeFilterCount = advancedFilters.filter((f) => {
    const v = filterValues[f.key];
    return Array.isArray(v) ? v.length > 0 : !!v && v !== "all";
  }).length;

  const filtered = all.filter((vehicle) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      vehicle.name.toLowerCase().includes(q) ||
      vehicle.assetTag.toLowerCase().includes(q) ||
      (vehicle.equipmentNumber ?? "").toLowerCase().includes(q) ||
      (vehicle.licensePlate ?? "").toLowerCase().includes(q) ||
      (vehicle.vin ?? "").toLowerCase().includes(q) ||
      (vehicle.assignedCrew ?? "").toLowerCase().includes(q) ||
      (vehicle.division ?? "").toLowerCase().includes(q);
    const matchStatus   = matchesFilter(vehicle.status, filterValues.status);
    const matchMake     = matchesFilter(vehicle.make ?? "", filterValues.make);
    const matchDivision = matchesFilter(vehicle.division ?? "", filterValues.division);
    const matchFuel     = matchesFilter(vehicle.fuelType ?? "", filterValues.fuelType);
    const matchCrew     = matchesFilter(vehicle.assignedCrew ?? "", filterValues.assignedCrew);
    return matchSearch && matchStatus && matchMake && matchDivision && matchFuel && matchCrew;
  });

  const selectedVehicle =
    (filtered.find((v) => v.id === selectedVehicleId) ??
      all.find((v) => v.id === selectedVehicleId)) ??
    null;

  function handleBarcodeScan(value: string) {
    const match = all.find(
      (v) =>
        v.barcode?.toLowerCase() === value.toLowerCase() ||
        v.assetTag.toLowerCase() === value.toLowerCase() ||
        (v.licensePlate ?? "").toLowerCase() === value.toLowerCase()
    );
    if (match) setSelectedVehicleId(match.id);
  }

  function handleFilterChange(key: string, value: string | string[]) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  // ── Shared filter controls ─────────────────────────────────────────────────
  const searchAndFilters = (
    <>
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        filters={[]}
        filterValues={filterValues}
        onFilterChange={handleFilterChange}
        searchPlaceholder="Search vehicles..."
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
      <VehicleListPanel
        vehicles={filtered}
        selectedId={selectedVehicleId}
        onSelect={setSelectedVehicleId}
      />
    </>
  );

  // ── Table view ─────────────────────────────────────────────────────────────
  const tableView = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
        <ColumnChooser
          columns={VEHICLE_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              {col("icon") && <TableHead className="w-12" />}
              <TableHead>Name</TableHead>
              {col("assetTag")        && <TableHead>Asset Tag</TableHead>}
              {col("equipmentNumber") && <TableHead>Equipment #</TableHead>}
              {col("make")            && <TableHead>Make</TableHead>}
              {col("model")           && <TableHead>Model</TableHead>}
              {col("year")            && <TableHead>Year</TableHead>}
              {col("licensePlate")    && <TableHead>License Plate</TableHead>}
              {col("division")        && <TableHead>Division</TableHead>}
              {col("assignedCrew")    && <TableHead>Assigned Crew</TableHead>}
              {col("fuelType")        && <TableHead>Fuel Type</TableHead>}
              {col("status")          && <TableHead>Status</TableHead>}
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
                  <p className="text-sm text-slate-400">No vehicles found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && filtered.map((vehicle) => (
              <TableRow
                key={vehicle.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetVehicle(vehicle)}
              >
                {col("icon") && (
                  <TableCell className="w-12 py-2 pl-4 pr-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-400 text-xs font-bold text-white">
                      {vehicle.name.slice(0, 2).toUpperCase()}
                    </div>
                  </TableCell>
                )}
                <TableCell className="font-medium">{vehicle.name}</TableCell>
                {col("assetTag") && (
                  <TableCell className="font-mono text-xs text-slate-500">{vehicle.assetTag}</TableCell>
                )}
                {col("equipmentNumber") && (
                  <TableCell className="font-mono text-xs text-slate-600">{vehicle.equipmentNumber ?? "—"}</TableCell>
                )}
                {col("make") && (
                  <TableCell className="text-slate-600">{vehicle.make ?? "—"}</TableCell>
                )}
                {col("model") && (
                  <TableCell className="text-slate-600">{vehicle.model ?? "—"}</TableCell>
                )}
                {col("year") && (
                  <TableCell className="text-slate-600">{vehicle.year ?? "—"}</TableCell>
                )}
                {col("licensePlate") && (
                  <TableCell className="font-mono text-xs text-slate-600">{vehicle.licensePlate ?? "—"}</TableCell>
                )}
                {col("division") && (
                  <TableCell className="text-slate-600">{vehicle.division ?? "—"}</TableCell>
                )}
                {col("assignedCrew") && (
                  <TableCell className="text-slate-600">{vehicle.assignedCrew ?? "—"}</TableCell>
                )}
                {col("fuelType") && (
                  <TableCell className="text-slate-600">{vehicle.fuelType ?? "—"}</TableCell>
                )}
                {col("status") && (
                  <TableCell>
                    <StatusBadge
                      variant={vehicle.status as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={ASSET_STATUS_LABELS[vehicle.status] ?? vehicle.status}
                    />
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
        title="Vehicles"
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
                  viewMode === "service" && "bg-amber-50 font-semibold text-amber-700"
                )}
                onClick={() => setViewMode("service")}
              >
                <ClipboardCheck className="mr-1.5 h-3.5 w-3.5" />
                Service
              </Button>
            </div>

            <ImportExportMenu
              entityLabel="Vehicles"
              templateColumns={["name", "assetTag", "make", "model", "year", "licensePlate", "vin", "fuelType", "status", "assignedCrew"]}
              templateFilename="vehicles-template.csv"
              requiredColumns={["name", "assetTag"]}
              onExport={() =>
                exportCSV(
                  all.map((v) => ({
                    name: v.name,
                    assetTag: v.assetTag,
                    make: v.make ?? "",
                    model: v.model ?? "",
                    year: v.year ?? "",
                    licensePlate: v.licensePlate ?? "",
                    vin: v.vin ?? "",
                    fuelType: v.fuelType ?? "",
                    status: v.status,
                    assignedCrew: v.assignedCrew ?? "",
                  })),
                  "vehicles-export.csv"
                )
              }
              onImport={(rows) => bulkImportVehicles(rows)}
            />
            <Button variant="outline" size="sm" onClick={() => setScanOpen(true)}>
              <ScanLine className="mr-1.5 h-4 w-4" />
              Scan
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Vehicle
            </Button>
          </div>
        }
      />

      {viewMode === "list" && (
        <MasterDetailLayout
          listPanel={listPanel}
          detailPanel={selectedVehicle ? <VehicleDetailPanel key={selectedVehicleId} vehicle={selectedVehicle} /> : null}
          emptyState={
            <EmptyState
              icon={Truck}
              title="Select a vehicle"
              description="Choose a vehicle from the list to view its details, VIN, Samsara integration, and history."
            />
          }
          hasSelection={!!selectedVehicle}
        />
      )}

      {viewMode === "table" && tableView}

      {viewMode === "service" && (
        <ServiceRemindersView
          vehicles={all}
          isLoading={isLoading}
          onRowClick={setSheetVehicle}
        />
      )}

      {/* Detail sheet — used by table and service views */}
      <Sheet open={!!sheetVehicle} onOpenChange={(o) => { if (!o) setSheetVehicle(null); }}>
        <SheetContent
          className="flex w-[580px] flex-col overflow-hidden p-0 sm:max-w-[580px]"
          onInteractOutside={(e) => e.preventDefault()}
        >
          {sheetVehicle && <VehicleDetailPanel vehicle={sheetVehicle} />}
        </SheetContent>
      </Sheet>

      <NewVehicleDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <BarcodeScanModal
        open={scanOpen}
        onOpenChange={setScanOpen}
        onScan={handleBarcodeScan}
        title="Scan Vehicle Tag"
        description="Point the camera at the barcode on the vehicle tag, or enter the code manually."
      />
    </div>
  );
}
