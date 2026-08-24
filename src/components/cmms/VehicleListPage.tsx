"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import {
  ClipboardCheck,
  FolderUp,
  Maximize2,
  Minimize2,
  Plus,
  ScanLine,
  Truck,
} from "lucide-react";
import { ServiceRemindersView } from "./ServiceRemindersView";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { PageHeader } from "@/components/shared/PageHeader";
import { getInitials, getAvatarColor } from "@/lib/utils";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarcodeScanModal } from "@/components/shared/BarcodeScanModal";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { useSort } from "@/lib/hooks/use-sort";
import { VehicleListPanel } from "./VehicleListPanel";
import { VehicleDetailPanel } from "./VehicleDetailPanel";
import { NewVehicleDialog } from "./NewVehicleDialog";
import { VehicleBulkImportDialog } from "./VehicleBulkImportDialog";
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
import { useAssets } from "@/lib/hooks/use-assets";
import { useMeters } from "@/lib/hooks/use-meters";
import { useCMMSStore } from "@/stores";
import { useRouter } from "next/navigation";
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

// ── Main component ────────────────────────────────────────────────────────────



export function VehicleListPage() {
  const { data: vehicles, isLoading } = useVehicles();
  const { mutateAsync: bulkImportVehicles } = useBulkImportVehicles();
  const { data: assets, isLoading: isAssetsLoading } = useAssets();
  const { data: meters } = useMeters();

  // Build vehicleId → current miles from all "miles"/"mi" meters
  const currentMilesMap = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const m of meters ?? []) {
      if (m.unit?.toLowerCase() === "miles" || m.unit?.toLowerCase() === "mi") {
        const existing = map.get(m.assetId);
        if (existing == null || m.currentValue > existing) {
          map.set(m.assetId, m.currentValue);
        }
      }
    }
    return map;
  }, [meters]);
  const { selectedVehicleId, setSelectedVehicleId, setSelectedAssetId } = useCMMSStore();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useStickyState<Record<string, string | string[]>>("vehicle-filters", {});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table" | "service">("list");
  const [sheetVehicleId, setSheetVehicleId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(VEHICLE_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = vehicles ?? [];
  // Always derive from the live query so the overlay shows fresh data (e.g. after thumbnail upload)
  const sheetVehicle = sheetVehicleId ? (all.find((v) => v.id === sheetVehicleId) ?? null) : null;

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

  const { sortKey, sortDir, toggle, sorted } = useSort(filtered, "name", "asc");

  const selectedVehicle =
    (filtered.find((v) => v.id === selectedVehicleId) ??
      all.find((v) => v.id === selectedVehicleId)) ??
    null;

  function handleBarcodeScan(raw: string) {
    if (isLoading || isAssetsLoading) {
      toast.error("Vehicles are still loading — try scanning again in a moment.");
      return;
    }

    const q = raw.trim().toLowerCase();

    // Search vehicles first
    const vehicleMatch = all.find(
      (v) =>
        v.barcode?.toLowerCase() === q ||
        v.assetTag.toLowerCase() === q ||
        (v.licensePlate ?? "").toLowerCase() === q
    );
    if (vehicleMatch) {
      setSelectedVehicleId(vehicleMatch.id);
      return;
    }

    // Fall back to assets — navigate there and pre-select
    const assetMatch = (assets ?? []).find(
      (a) =>
        a.barcode?.toLowerCase() === q ||
        a.assetTag.toLowerCase() === q
    );
    if (assetMatch) {
      setSelectedAssetId(assetMatch.id);
      router.push("/cmms/assets");
      return;
    }

    toast.error(`No asset or vehicle found for code "${raw}"`);
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
              <SortableTableHead label="Name" sortKey="name" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              {col("assetTag") && <SortableTableHead label="Asset Tag" sortKey="assetTag" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("equipmentNumber") && <SortableTableHead label="Equipment #" sortKey="equipmentNumber" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("make") && <SortableTableHead label="Make" sortKey="make" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("model") && <SortableTableHead label="Model" sortKey="model" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("year") && <SortableTableHead label="Year" sortKey="year" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("licensePlate") && <SortableTableHead label="License Plate" sortKey="licensePlate" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("division") && <SortableTableHead label="Division" sortKey="division" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("assignedCrew") && <SortableTableHead label="Assigned Crew" sortKey="assignedCrew" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("fuelType") && <SortableTableHead label="Fuel Type" sortKey="fuelType" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("status") && <SortableTableHead label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
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

            {!isLoading && sorted.map((vehicle) => (
              <TableRow
                key={vehicle.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetVehicleId(vehicle.id)}
              >
                {col("icon") && (
                  <TableCell className="w-12 py-2 pl-4 pr-0">
                    {vehicle.photoUrl ? (
                      <img
                        src={vehicle.photoUrl}
                        alt={vehicle.name}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                          getAvatarColor(vehicle.name)
                        )}
                      >
                        {getInitials(vehicle.name)}
                      </div>
                    )}
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
          <div className="flex flex-wrap items-center gap-2">
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
              templateColumns={["name", "assetTag", "make", "model", "year", "licensePlate", "vin", "fuelType", "status", "assignedCrew", "purchaseVendorName", "purchaseDate", "purchasePrice", "paymentMethod", "financeInstitution"]}
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
            <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)}>
              <FolderUp className="mr-1.5 h-4 w-4" />
              Import Files
            </Button>
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
              description="Choose a vehicle from the list to view its details, VIN, associated parts, meters and maintenance history."
            />
          }
          hasSelection={!!selectedVehicle}
          onBack={() => setSelectedVehicleId(null)}
        />
      )}

      {viewMode === "table" && tableView}

      {viewMode === "service" && (
        <ServiceRemindersView
          vehicles={all}
          isLoading={isLoading}
          onRowClick={(v) => setSheetVehicleId(v.id)}
          currentMilesMap={currentMilesMap}
        />
      )}

      {/* Detail sheet — used by table and service views */}
      <Sheet open={!!sheetVehicle} onOpenChange={(o) => { if (!o) setSheetVehicleId(null); }}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]"
        >
          {sheetVehicle && <VehicleDetailPanel key={sheetVehicle.id} vehicle={sheetVehicle} />}
        </SheetContent>
      </Sheet>

      <NewVehicleDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <VehicleBulkImportDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} />

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
