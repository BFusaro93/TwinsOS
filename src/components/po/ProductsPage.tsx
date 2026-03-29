"use client";

import { useState } from "react";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import { Plus, Package, BookOpen } from "lucide-react";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { matchesFilter } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/shared/PageHeader";
import { FilterBar } from "@/components/shared/FilterBar";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ProductDetailSheet } from "./ProductDetailSheet";
import { NewProductDialog } from "./NewProductDialog";
import { BulkPriceUpdateDialog } from "./BulkPriceUpdateDialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { PRODUCT_CATEGORY_LABELS } from "@/lib/constants";
import { useProducts, useBulkImportProducts } from "@/lib/hooks/use-products";
import type { ProductItem } from "@/types";

const PRODUCTS_COLUMNS: ColumnDef[] = [
  { key: "photo", label: "Photo", locked: true },
  { key: "name", label: "Name", locked: true },
  { key: "partNumber", label: "Part #" },
  { key: "category", label: "Category" },
  { key: "vendor", label: "Vendor" },
  { key: "unitCost", label: "Unit Cost" },
  { key: "salePrice", label: "Sale Price" },
  { key: "trackInventory", label: "Track Inventory" },
  { key: "qtyOnHand", label: "Qty on Hand" },
];

const CATEGORY_OPTIONS = [
  { value: "maintenance_part", label: "Maintenance Part" },
  { value: "stocked_material", label: "Stocked Material" },
  { value: "project_material", label: "Project Material" },
];

const TRACK_INVENTORY_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export function ProductsPage() {
  const { data: products, isLoading } = useProducts();
  const { mutateAsync: bulkImportProducts } = useBulkImportProducts();
  const [selectedProduct, setSelectedProduct] = useState<ProductItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useStickyState<Record<string, string | string[]>>("product-filters", {});
  const [visibleKeys, setVisibleKeys] = useState<string[]>(PRODUCTS_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);

  const all = products ?? [];

  // Derive vendor options from loaded data
  const vendorOptions = Array.from(new Set(all.map((p) => p.vendorName).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v, label: v }));

  const filtered = all.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.partNumber.toLowerCase().includes(q) ||
      p.vendorName.toLowerCase().includes(q);
    const matchCategory = matchesFilter(p.category, filterValues.category);
    const matchVendor = matchesFilter(p.vendorName, filterValues.vendor);
    const trackFilter = filterValues.trackInventory;
    const matchInventory = !trackFilter || (
      Array.isArray(trackFilter)
        ? trackFilter.length === 0 || trackFilter.some((s) => (s === "yes" && p.isInventory) || (s === "no" && !p.isInventory))
        : trackFilter === "all" || (trackFilter === "yes" && p.isInventory) || (trackFilter === "no" && !p.isInventory)
    );
    return matchSearch && matchCategory && matchVendor && matchInventory;
  });

  const inventoryCount = all.filter((p) => p.isInventory).length;
  const nonInventoryCount = all.filter((p) => !p.isInventory).length;

  function handleRowClick(product: ProductItem) {
    setSelectedProduct(product);
    setSheetOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Products"
        description="Manage parts, materials, and supplies"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ImportExportMenu
              entityLabel="Products"
              templateColumns={["name", "partNumber", "description", "category", "unitCost", "isInventory", "quantityOnHand", "vendorName"]}
              templateFilename="products-template.csv"
              requiredColumns={["name", "partNumber", "category"]}
              onExport={() =>
                exportCSV(
                  all.map((p) => ({
                    name: p.name,
                    partNumber: p.partNumber,
                    description: p.description ?? "",
                    category: p.category,
                    unitCost: (p.unitCost / 100).toFixed(2),
                    isInventory: p.isInventory ? "yes" : "no",
                    quantityOnHand: p.quantityOnHand ?? "",
                    vendorName: p.vendorName,
                  })),
                  "products-export.csv"
                )
              }
              onImport={(rows) => bulkImportProducts(rows)}
            />
            <Button size="sm" variant="outline" onClick={() => setBulkPriceOpen(true)}>
              Update Prices
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New Product
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard title="Total Products" value={all.length} icon={Package} />
        <StatCard title="Inventory Items" value={inventoryCount} />
        <StatCard title="Non-Inventory" value={nonInventoryCount} />
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-2">
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          filters={[
            { key: "category", placeholder: "All Categories", options: CATEGORY_OPTIONS, multi: true },
            { key: "vendor", placeholder: "All Vendors", options: vendorOptions, multi: true },
            { key: "trackInventory", placeholder: "Track Inventory", options: TRACK_INVENTORY_OPTIONS, multi: true },
          ]}
          filterValues={filterValues}
          onFilterChange={(key, value) =>
            setFilterValues((prev) => ({ ...prev, [key]: value }))
          }
          searchPlaceholder="Search products..."
        />
        <ColumnChooser
          columns={PRODUCTS_COLUMNS}
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
              {col("salePrice") && <TableHead className="text-right">Sale Price</TableHead>}
              {col("trackInventory") && <TableHead>Track Inventory</TableHead>}
              {col("qtyOnHand") && <TableHead className="text-right">Qty on Hand</TableHead>}
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
                  <p className="text-sm text-slate-400">No products found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              filtered.map((product) => (
                <TableRow
                  key={product.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => handleRowClick(product)}
                >
                  <TableCell className="w-12 py-2 pl-4 pr-0">
                    {product.pictureUrl ? (
                      <img
                        src={product.pictureUrl}
                        alt={product.name}
                        className="h-9 w-9 rounded-md object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100">
                        <BookOpen className="h-4 w-4 text-slate-400" />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  {col("partNumber") && (
                    <TableCell className="font-mono text-xs text-slate-500">
                      {product.partNumber}
                    </TableCell>
                  )}
                  {col("category") && (
                    <TableCell>
                      <StatusBadge
                        variant={product.category}
                        label={PRODUCT_CATEGORY_LABELS[product.category]}
                      />
                    </TableCell>
                  )}
                  {col("vendor") && (
                    <TableCell className="text-slate-600">{product.vendorName}</TableCell>
                  )}
                  {col("unitCost") && (
                    <TableCell className="text-right">{formatCurrency(product.unitCost)}</TableCell>
                  )}
                  {col("salePrice") && (
                    <TableCell className="text-right">{formatCurrency(product.price)}</TableCell>
                  )}
                  {col("trackInventory") && (
                    <TableCell>
                      <span
                        className={
                          product.isInventory
                            ? "text-xs font-medium text-green-700"
                            : "text-xs text-slate-400"
                        }
                      >
                        {product.isInventory ? "Yes" : "No"}
                      </span>
                    </TableCell>
                  )}
                  {col("qtyOnHand") && (
                    <TableCell className="text-right">
                      {product.isInventory ? product.quantityOnHand : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <ProductDetailSheet
        product={selectedProduct}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <NewProductDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <BulkPriceUpdateDialog
        open={bulkPriceOpen}
        onOpenChange={setBulkPriceOpen}
        products={all}
      />
    </div>
  );
}
