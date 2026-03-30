"use client";

import { useState } from "react";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import { HardHat, Maximize2, Minimize2, Plus, ScanLine } from "lucide-react";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { EmptyState } from "@/components/shared/EmptyState";
import { BarcodeScanModal } from "@/components/shared/BarcodeScanModal";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { useSort } from "@/lib/hooks/use-sort";
import { AssetListPanel } from "./AssetListPanel";
import { AssetDetailPanel } from "./AssetDetailPanel";
import { NewAssetDialog } from "./NewAssetDialog";
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
import { useAssets, useBulkImportAssets } from "@/lib/hooks/use-assets";
import { useVehicles } from "@/lib/hooks/use-vehicles";
import { useCMMSStore } from "@/stores";
import { useRouter } from "next/navigation";
import { ASSET_STATUS_LABELS } from "@/lib/constants";
import { cn, matchesFilter, getInitials, getAvatarColor } from "@/lib/utils";
import type { Asset } from "@/types";

const STATUS_OPTIONS = Object.entries(ASSET_STATUS_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const ASSET_COLUMNS: ColumnDef[] = [
  { key: "icon", label: "Icon", locked: true },
  { key: "name", label: "Name", locked: true },
  { key: "assetTag", label: "Asset Tag" },
  { key: "equipmentNumber", label: "Equipment #" },
  { key: "assetType", label: "Type" },
  { key: "make", label: "Make" },
  { key: "model", label: "Model" },
  { key: "year", label: "Year" },
  { key: "division", label: "Division" },
  { key: "location", label: "Location" },
  { key: "status", label: "Status" },
];

export function AssetListPage() {
  const { data: assets, isLoading } = useAssets();
  const { mutateAsync: bulkImportAssets } = useBulkImportAssets();
  const { data: vehicles } = useVehicles();
  const { selectedAssetId, setSelectedAssetId, setSelectedVehicleId } = useCMMSStore();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useStickyState<Record<string, string | string[]>>("asset-filters", {});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [sheetAssetId, setSheetAssetId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(ASSET_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = assets ?? [];
  // Always derive from the live query so the overlay shows fresh data (e.g. after thumbnail upload)
  const sheetAsset = sheetAssetId ? (all.find((a) => a.id === sheetAssetId) ?? null) : null;

  // Derive filter options from live data
  const assetTypeOptions = Array.from(new Set(all.map((a) => a.assetType).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

  const makeOptions = Array.from(new Set(all.map((a) => a.make).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const divisionOptions = Array.from(new Set(all.map((a) => a.division).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const locationOptions = Array.from(new Set(all.map((a) => a.location).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const advancedFilters = [
    { key: "status", placeholder: "All Statuses", options: STATUS_OPTIONS, multi: true as const },
    { key: "assetType", placeholder: "All Types", options: assetTypeOptions, multi: true as const },
    { key: "make", placeholder: "All Makes", options: makeOptions, multi: true as const },
    { key: "division", placeholder: "All Divisions", options: divisionOptions, multi: true as const },
    { key: "location", placeholder: "All Locations", options: locationOptions, multi: true as const },
  ];

  const activeFilterCount = advancedFilters.filter((f) => {
    const v = filterValues[f.key];
    return Array.isArray(v) ? v.length > 0 : !!v && v !== "all";
  }).length;

  const filtered = all.filter((asset) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      asset.name.toLowerCase().includes(q) ||
      asset.assetTag.toLowerCase().includes(q) ||
      (asset.equipmentNumber ?? "").toLowerCase().includes(q) ||
      (asset.make ?? "").toLowerCase().includes(q) ||
      (asset.model ?? "").toLowerCase().includes(q) ||
      (asset.division ?? "").toLowerCase().includes(q) ||
      (asset.location ?? "").toLowerCase().includes(q);
    const matchStatus = matchesFilter(asset.status, filterValues.status);
    const matchType = matchesFilter(asset.assetType, filterValues.assetType);
    const matchMake = matchesFilter(asset.make ?? "", filterValues.make);
    const matchDivision = matchesFilter(asset.division ?? "", filterValues.division);
    const matchLocation = matchesFilter(asset.location ?? "", filterValues.location);
    return matchSearch && matchStatus && matchType && matchMake && matchDivision && matchLocation;
  });

  const { sortKey, sortDir, toggle, sorted } = useSort(filtered, "name", "asc");

  const selectedAsset =
    (filtered.find((a) => a.id === selectedAssetId) ??
      all.find((a) => a.id === selectedAssetId)) ??
    null;

  function handleBarcodeScan(raw: string) {
    const q = raw.toLowerCase();

    // Search assets first
    const assetMatch = all.find(
      (a) =>
        a.barcode?.toLowerCase() === q ||
        a.assetTag.toLowerCase() === q
    );
    if (assetMatch) {
      setSelectedAssetId(assetMatch.id);
      return;
    }

    // Fall back to vehicles — navigate there and pre-select
    const vehicleMatch = (vehicles ?? []).find(
      (v) =>
        v.barcode?.toLowerCase() === q ||
        v.assetTag.toLowerCase() === q ||
        (v.licensePlate ?? "").toLowerCase() === q
    );
    if (vehicleMatch) {
      setSelectedVehicleId(vehicleMatch.id);
      router.push("/cmms/vehicles");
    }
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
        searchPlaceholder="Search assets..."
      />
      <AdvancedSearchDialog
        filters={advancedFilters}
        filterValues={filterValues}
        onFilterChange={(key, value) => handleFilterChange(key, value)}
        activeCount={activeFilterCount}
      />
    </>
  );

  // ── List panel (narrow master-detail mode) ──────────────────────────────────
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
      <AssetListPanel
        assets={filtered}
        selectedId={selectedAssetId}
        onSelect={setSelectedAssetId}
      />
    </>
  );

  // ── Table view (expanded full-width mode) ───────────────────────────────────
  const tableView = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
        <ColumnChooser
          columns={ASSET_COLUMNS}
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
              {col("assetType") && <SortableTableHead label="Type" sortKey="assetType" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("make") && <SortableTableHead label="Make" sortKey="make" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("model") && <SortableTableHead label="Model" sortKey="model" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("year") && <SortableTableHead label="Year" sortKey="year" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("division") && <SortableTableHead label="Division" sortKey="division" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("location") && <SortableTableHead label="Location" sortKey="location" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
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
                  <p className="text-sm text-slate-400">No assets found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && sorted.map((asset) => (
              <TableRow
                key={asset.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetAssetId(asset.id)}
              >
                {col("icon") && (
                  <TableCell className="w-12 py-2 pl-4 pr-0">
                    {asset.photoUrl ? (
                      <img
                        src={asset.photoUrl}
                        alt={asset.name}
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                          getAvatarColor(asset.name)
                        )}
                      >
                        {getInitials(asset.name)}
                      </div>
                    )}
                  </TableCell>
                )}
                <TableCell className="font-medium">{asset.name}</TableCell>
                {col("assetTag") && (
                  <TableCell className="font-mono text-xs text-slate-500">{asset.assetTag}</TableCell>
                )}
                {col("equipmentNumber") && (
                  <TableCell className="font-mono text-xs text-slate-600">{asset.equipmentNumber ?? "—"}</TableCell>
                )}
                {col("assetType") && (
                  <TableCell className="text-slate-600 capitalize">
                    {asset.assetType.replace(/_/g, " ")}
                  </TableCell>
                )}
                {col("make") && (
                  <TableCell className="text-slate-600">{asset.make ?? "—"}</TableCell>
                )}
                {col("model") && (
                  <TableCell className="text-slate-600">{asset.model ?? "—"}</TableCell>
                )}
                {col("year") && (
                  <TableCell className="text-slate-600">{asset.year ?? "—"}</TableCell>
                )}
                {col("division") && (
                  <TableCell className="text-slate-600">{asset.division ?? "—"}</TableCell>
                )}
                {col("location") && (
                  <TableCell className="text-slate-600">{asset.location ?? "—"}</TableCell>
                )}
                {col("status") && (
                  <TableCell>
                    <StatusBadge
                      variant={asset.status as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={ASSET_STATUS_LABELS[asset.status] ?? asset.status}
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
        title="Assets"
        action={
          <div className="flex flex-wrap items-center gap-2">
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
            <ImportExportMenu
              entityLabel="Assets"
              templateColumns={["name", "assetTag", "equipmentNumber", "assetType", "make", "model", "year", "serialNumber", "location", "status", "purchaseVendorName", "purchaseDate", "purchasePrice", "paymentMethod", "financeInstitution"]}
              templateFilename="assets-template.csv"
              requiredColumns={["name", "assetTag"]}
              onExport={() =>
                exportCSV(
                  all.map((a) => ({
                    name: a.name,
                    assetTag: a.assetTag,
                    equipmentNumber: a.equipmentNumber ?? "",
                    assetType: a.assetType,
                    make: a.make ?? "",
                    model: a.model ?? "",
                    year: a.year ?? "",
                    serialNumber: a.serialNumber ?? "",
                    location: a.location ?? "",
                    status: a.status,
                  })),
                  "assets-export.csv"
                )
              }
              onImport={(rows) => bulkImportAssets(rows)}
            />
            <Button variant="outline" size="sm" onClick={() => setScanOpen(true)}>
              <ScanLine className="mr-1.5 h-4 w-4" />
              Scan
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Asset
            </Button>
          </div>
        }
      />

      {viewMode === "list" ? (
        <MasterDetailLayout
          listPanel={listPanel}
          detailPanel={selectedAsset ? <AssetDetailPanel key={selectedAssetId} asset={selectedAsset} /> : null}
          emptyState={
            <EmptyState
              icon={HardHat}
              title="Select an asset"
              description="Choose an asset from the list to view its details, filter part numbers, and maintenance history."
            />
          }
          hasSelection={!!selectedAsset}
          onBack={() => setSelectedAssetId(null)}
        />
      ) : (
        tableView
      )}

      {/* Table-mode detail sheet */}
      <Sheet open={!!sheetAsset} onOpenChange={(o) => { if (!o) setSheetAssetId(null); }}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[720px] md:max-w-[720px]"
        >
          {sheetAsset && <AssetDetailPanel asset={sheetAsset} />}
        </SheetContent>
      </Sheet>

      <NewAssetDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <BarcodeScanModal
        open={scanOpen}
        onOpenChange={setScanOpen}
        onScan={handleBarcodeScan}
        title="Scan Asset Tag"
        description="Point the camera at the barcode on the asset tag, or enter the code manually."
      />
    </div>
  );
}
