"use client";

import { useState, useEffect } from "react";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import { useSearchParams } from "next/navigation";
import { Plus, Package, Cog, ShoppingCart } from "lucide-react";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatCard } from "@/components/shared/StatCard";
import { PartDetailSheet } from "./PartDetailSheet";
import { NewPartDialog } from "./NewPartDialog";
import { BulkPartCostDialog } from "./BulkPartCostDialog";
import { Button } from "@/components/ui/button";
import { formatCurrency, matchesFilter } from "@/lib/utils";
import { useParts, useBulkImportParts } from "@/lib/hooks/use-parts";
import { useProducts } from "@/lib/hooks/use-products";
import type { Part } from "@/types";

const STOCK_FILTER_OPTIONS = [
  { value: "oos_critical", label: "OOS (has min)" },
  { value: "oos_no_min",   label: "OOS (no min)" },
  { value: "low_stock",    label: "Low Stock" },
  { value: "in_stock",     label: "In Stock" },
];

const PARTS_COLUMNS: ColumnDef[] = [
  { key: "photo", label: "Photo", locked: true },
  { key: "name", label: "Name", locked: true },
  { key: "partNumber", label: "Part #" },
  { key: "category", label: "Category" },
  { key: "vendor", label: "Vendor" },
  { key: "unitCost", label: "Unit Cost" },
  { key: "onHand", label: "On Hand" },
  { key: "minStock", label: "Min Stock" },
  { key: "status", label: "Status" },
];

export function PartsPage() {
  const { data: parts, isLoading } = useParts();
  const { mutateAsync: bulkImportParts } = useBulkImportParts();
  const { data: products } = useProducts();
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchParams = useSearchParams();

  // Auto-open a part when arriving from a notification deep-link (?open=<partId>)
  useEffect(() => {
    const openId = searchParams.get("open");
    if (openId && parts) {
      const target = parts.find((p) => p.id === openId);
      if (target) {
        setSelectedPart(target);
        setSheetOpen(true);
      }
    }
  }, [searchParams, parts]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkCostOpen, setBulkCostOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useStickyState<Record<string, string | string[]>>("parts-filters", {});
  const [visibleKeys, setVisibleKeys] = useState<string[]>(PARTS_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);

  const all = parts ?? [];

  // Build a set of part numbers that have a matching maintenance_part product
  // (by explicit FK or by matching part number) — used to show the catalog icon
  const catalogPartNumbers = new Set(
    (products ?? [])
      .filter((p) => p.category === "maintenance_part")
      .map((p) => p.partNumber)
  );

  // Derive filter options dynamically from loaded data
  const categoryOptions = Array.from(new Set(all.map((p) => p.category)))
    .sort()
    .map((c) => ({ value: c, label: c }));

  const vendorOptions = Array.from(new Set(all.map((p) => p.vendorName).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v!, label: v! }));

  const filtered = all.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.partNumber.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      (p.vendorName ?? "").toLowerCase().includes(q);
    const stockFilter = filterValues.stock;
    // Non-inventory parts have no meaningful stock status — exclude them when
    // a stock filter is active rather than misrepresenting their qty.
    const isOOSCritical = p.isInventory && p.quantityOnHand === 0 && p.minimumStock > 0;
    const isOOSNoMin    = p.isInventory && p.quantityOnHand === 0 && p.minimumStock === 0;
    const isOutOfStock  = isOOSCritical || isOOSNoMin;
    const isLowStock    = p.isInventory && !isOutOfStock && p.minimumStock > 0 && p.quantityOnHand <= p.minimumStock;
    const isInStock     = p.isInventory && !isOutOfStock && !isLowStock;
    const matchStock = !stockFilter || (
      Array.isArray(stockFilter)
        ? stockFilter.length === 0 || (p.isInventory && stockFilter.some(s =>
            (s === "oos_critical" && isOOSCritical) ||
            (s === "oos_no_min"   && isOOSNoMin)    ||
            (s === "low_stock"    && isLowStock)     ||
            (s === "in_stock"     && isInStock)))
        : stockFilter === "all" || (p.isInventory && (
            (stockFilter === "oos_critical" && isOOSCritical) ||
            (stockFilter === "oos_no_min"   && isOOSNoMin)    ||
            (stockFilter === "low_stock"    && isLowStock)     ||
            (stockFilter === "in_stock"     && isInStock)))
    );
    const matchCategory = matchesFilter(p.category, filterValues.category);
    const matchVendor = matchesFilter(p.vendorName ?? "", filterValues.vendor);
    return matchSearch && matchStock && matchCategory && matchVendor;
  });

  const lowStockCount = all.filter((p) => p.isInventory && p.quantityOnHand > 0 && p.minimumStock > 0 && p.quantityOnHand <= p.minimumStock).length;
  const oosCriticalCount = all.filter((p) => p.isInventory && p.quantityOnHand === 0 && p.minimumStock > 0).length;
  const totalQty = all.filter((p) => p.isInventory).reduce((sum, p) => sum + p.quantityOnHand, 0);

  function handleRowClick(part: Part) {
    setSelectedPart(part);
    setSheetOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Parts Inventory"
        description="Spare parts and consumables"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportExportMenu
              entityLabel="Parts"
              templateColumns={["name", "partNumber", "description", "category", "unitCost", "quantityOnHand", "minimumStock", "vendorName", "location"]}
              templateFilename="parts-template.csv"
              requiredColumns={["name", "partNumber"]}
              onExport={() =>
                exportCSV(
                  (all).map((p) => ({
                    name: p.name,
                    partNumber: p.partNumber,
                    description: p.description ?? "",
                    category: p.category,
                    unitCost: (p.unitCost / 100).toFixed(2),
                    quantityOnHand: p.quantityOnHand,
                    minimumStock: p.minimumStock,
                    vendorName: p.vendorName ?? "",
                  })),
                  "parts-export.csv"
                )
              }
              onImport={(rows) => bulkImportParts(rows)}
            />
            <Button size="sm" variant="outline" onClick={() => setBulkCostOpen(true)}>
              Update Costs
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Part
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Total Parts" value={all.length} icon={Package} />
        <StatCard title="Total Units on Hand" value={totalQty} />
        <StatCard
          title="Low Stock Items"
          value={lowStockCount}
          className={lowStockCount > 0 ? "border-red-200 bg-red-50" : ""}
        />
      </div>

      {/* Filter + column chooser */}
      <div className="flex items-center justify-between gap-2">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            { key: "stock", placeholder: "All Stock Levels", options: STOCK_FILTER_OPTIONS, multi: true },
            { key: "category", placeholder: "All Categories", options: categoryOptions, multi: true },
            { key: "vendor", placeholder: "All Vendors", options: vendorOptions, multi: true },
          ]}
          filterValues={filterValues}
          onFilterChange={(key, value) =>
            setFilterValues((prev) => ({ ...prev, [key]: value }))
          }
          searchPlaceholder="Search parts..."
        />
        <ColumnChooser
          columns={PARTS_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="w-12" />
              <TableHead>Name</TableHead>
              {col("partNumber") && <TableHead>Part #</TableHead>}
              {col("category") && <TableHead>Category</TableHead>}
              {col("vendor") && <TableHead>Vendor</TableHead>}
              {col("unitCost") && <TableHead className="text-right">Unit Cost</TableHead>}
              {col("onHand") && <TableHead className="text-right">On Hand</TableHead>}
              {col("minStock") && <TableHead className="text-right">Min Stock</TableHead>}
              {col("status") && <TableHead>Status</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: visibleKeys.length }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={visibleKeys.length} className="py-12 text-center">
                  <p className="text-sm text-slate-400">No parts found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              filtered.map((part) => {
                const isOOSCritical = part.isInventory && part.quantityOnHand === 0 && part.minimumStock > 0;
                const isOOSNoMin    = part.isInventory && part.quantityOnHand === 0 && part.minimumStock === 0;
                const isOutOfStock  = isOOSCritical || isOOSNoMin;
                const isLowStock    = part.isInventory && !isOutOfStock && part.minimumStock > 0 && part.quantityOnHand <= part.minimumStock;
                return (
                  <TableRow
                    key={part.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => handleRowClick(part)}
                  >
                    <TableCell className="w-12 py-2 pl-4 pr-0">
                      {part.pictureUrl ? (
                        <img
                          src={part.pictureUrl}
                          alt={part.name}
                          className="h-9 w-9 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100">
                          <Cog className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-1.5">
                        {part.name}
                        {catalogPartNumbers.has(part.partNumber) && (
                          <ShoppingCart
                            className="h-3 w-3 shrink-0 text-brand-400"
                            aria-label="Linked to purchasing catalog"
                          />
                        )}
                      </div>
                    </TableCell>
                    {col("partNumber") && (
                      <TableCell className="font-mono text-xs text-slate-500">
                        {part.partNumber}
                      </TableCell>
                    )}
                    {col("category") && (
                      <TableCell className="text-slate-600">{part.category}</TableCell>
                    )}
                    {col("vendor") && (
                      <TableCell className="text-slate-600">{part.vendorName}</TableCell>
                    )}
                    {col("unitCost") && (
                      <TableCell className="text-right">
                        {formatCurrency(part.unitCost)}
                      </TableCell>
                    )}
                    {col("onHand") && (
                      <TableCell
                        className={`text-right font-medium ${
                          !part.isInventory
                            ? "text-slate-400"
                            : isLowStock
                            ? "text-red-700"
                            : "text-slate-900"
                        }`}
                      >
                        {part.isInventory ? part.quantityOnHand : "—"}
                      </TableCell>
                    )}
                    {col("minStock") && (
                      <TableCell className="text-right text-slate-500">
                        {part.isInventory ? part.minimumStock : "—"}
                      </TableCell>
                    )}
                    {col("status") && (
                      <TableCell>
                        {!part.isInventory ? (
                          <Badge
                            variant="outline"
                            className="border-slate-200 bg-slate-50 text-slate-500"
                          >
                            Not Tracked
                          </Badge>
                        ) : isOOSCritical ? (
                          <Badge
                            variant="outline"
                            className="border-red-200 bg-red-50 text-red-700"
                          >
                            OOS
                          </Badge>
                        ) : isOOSNoMin ? (
                          <Badge
                            variant="outline"
                            className="border-orange-200 bg-orange-50 text-orange-700"
                          >
                            OOS
                          </Badge>
                        ) : isLowStock ? (
                          <Badge
                            variant="outline"
                            className="border-red-200 bg-red-50 text-red-700"
                          >
                            Low Stock
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-green-200 bg-green-50 text-green-700"
                          >
                            In Stock
                          </Badge>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      <PartDetailSheet
        part={selectedPart}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <NewPartDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <BulkPartCostDialog
        open={bulkCostOpen}
        onOpenChange={setBulkCostOpen}
        parts={all}
      />
    </div>
  );
}
