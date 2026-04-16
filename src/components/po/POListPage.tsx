"use client";

import { useState } from "react";
import { useStickyState } from "@/lib/hooks/use-sticky-state";
import { Maximize2, Minimize2, Plus, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { MasterDetailLayout } from "@/components/shared/MasterDetailLayout";
import { FilterBar } from "@/components/shared/FilterBar";
import { AdvancedSearchDialog } from "@/components/shared/AdvancedSearchDialog";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { POListPanel } from "./POListPanel";
import { PODetailPanel } from "./PODetailPanel";
import { NewPODialog } from "./NewPODialog";
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
import { usePurchaseOrders, useBulkImportPurchaseOrders } from "@/lib/hooks/use-purchase-orders";
import { ImportExportMenu } from "@/components/shared/ImportExportMenu";
import { exportCSV } from "@/lib/csv";
import { usePOStore } from "@/stores";
import { useSort } from "@/lib/hooks/use-sort";
import { SortableTableHead } from "@/components/shared/SortableTableHead";
import { PO_STATUS_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate, matchesFilter } from "@/lib/utils";
import type { POStatus, PurchaseOrder } from "@/types";

const STATUS_OPTIONS = (Object.keys(PO_STATUS_LABELS) as POStatus[]).map((k) => ({
  value: k,
  label: PO_STATUS_LABELS[k],
}));

const PO_COLUMNS: ColumnDef[] = [
  { key: "poNumber",   label: "PO #",       locked: true },
  { key: "vendorName", label: "Vendor",      locked: true },
  { key: "status",     label: "Status" },
  { key: "lineItems",  label: "Line Items" },
  { key: "grandTotal", label: "Total" },
  { key: "payment",    label: "Payment" },
  { key: "poDate",     label: "PO Date" },
  { key: "createdAt",  label: "Created" },
];

export function POListPage() {
  const { data: orders, isLoading } = usePurchaseOrders();
  const { mutateAsync: bulkImportPOs } = useBulkImportPurchaseOrders();
  const { selectedPOId, setSelectedPOId } = usePOStore();
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useStickyState<Record<string, string | string[]>>("po-filters", {});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "table">("list");
  const [sheetPOId, setSheetPOId] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<string[]>(PO_COLUMNS.map((c) => c.key));

  const col = (key: string) => visibleKeys.includes(key);
  const all = orders ?? [];
  // Always derive from the live query so the sheet panel reflects cache updates
  // (e.g. after submitting for approval the status change is visible immediately)
  const sheetPO = sheetPOId ? (all.find((po) => po.id === sheetPOId) ?? null) : null;

  // Derive filter options from live data
  const vendorOptions = Array.from(new Set(all.map((po) => po.vendorName).filter(Boolean)))
    .sort()
    .map((v) => ({ value: v, label: v }));

  const PAYMENT_OPTIONS = [
    { value: "unpaid",    label: "Unpaid" },
    { value: "submitted", label: "Submitted to AP" },
    { value: "remitted",  label: "Remitted" },
    { value: "booked",    label: "Booked in QB" },
  ];

  const advancedFilters = [
    { key: "status",     placeholder: "All Statuses", options: STATUS_OPTIONS,   multi: true as const },
    { key: "vendorName", placeholder: "All Vendors",  options: vendorOptions,    multi: true as const },
    { key: "payment",    placeholder: "All Payments", options: PAYMENT_OPTIONS,  multi: true as const },
  ];

  const activeFilterCount = advancedFilters.filter((f) => {
    const v = filterValues[f.key];
    return Array.isArray(v) ? v.length > 0 : !!v && v !== "all";
  }).length;

  function handleFilterChange(key: string, value: string | string[]) {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
  }

  function paymentLabel(po: PurchaseOrder): string {
    if (po.paymentBookedInQB) return "Booked in QB";
    if (po.paymentRemitted)   return "Remitted";
    if (po.paymentSubmittedToAP) return "Submitted to AP";
    return "Unpaid";
  }

  function paymentFilterKey(po: PurchaseOrder): string {
    if (po.paymentBookedInQB) return "booked";
    if (po.paymentRemitted)   return "remitted";
    if (po.paymentSubmittedToAP) return "submitted";
    return "unpaid";
  }

  const filtered = all.filter((po) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      po.poNumber.toLowerCase().includes(q) ||
      po.vendorName.toLowerCase().includes(q);
    const matchStatus  = matchesFilter(po.status, filterValues.status);
    const matchVendor  = matchesFilter(po.vendorName, filterValues.vendorName);
    const matchPayment = matchesFilter(paymentFilterKey(po), filterValues.payment);
    return matchSearch && matchStatus && matchVendor && matchPayment;
  });

  const { sortKey, sortDir, toggle, sorted } = useSort(filtered, "poDate", "desc");

  const selectedPO =
    (filtered.find((po) => po.id === selectedPOId) ??
      all.find((po) => po.id === selectedPOId)) ??
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
        searchPlaceholder="Search POs..."
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
      <POListPanel
        orders={filtered}
        selectedId={selectedPOId}
        onSelect={setSelectedPOId}
      />
    </>
  );

  // ── Table view ─────────────────────────────────────────────────────────────
  const tableView = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{searchAndFilters}</div>
        <ColumnChooser
          columns={PO_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>
      <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <SortableTableHead label="PO #" sortKey="poNumber" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              <SortableTableHead label="Vendor" sortKey="vendorName" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
              {col("status")     && <SortableTableHead label="Status" sortKey="status" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("lineItems")  && <SortableTableHead label="Items" sortKey="lineItems" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="text-right" />}
              {col("grandTotal") && <SortableTableHead label="Total" sortKey="grandTotal" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} className="text-right" />}
              {col("payment")    && <SortableTableHead label="Payment" sortKey="payment" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("poDate")     && <SortableTableHead label="PO Date" sortKey="poDate" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
              {col("createdAt")  && <SortableTableHead label="Created" sortKey="createdAt" activeSortKey={sortKey} sortDir={sortDir} onToggle={toggle} />}
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
                  <p className="text-sm text-slate-400">No purchase orders found</p>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && sorted.map((po) => (
              <TableRow
                key={po.id}
                className="cursor-pointer hover:bg-slate-50"
                onClick={() => setSheetPOId(po.id)}
              >
                <TableCell className="font-mono text-xs text-slate-500">{po.poNumber}</TableCell>
                <TableCell className="font-medium">{po.vendorName}</TableCell>
                {col("status") && (
                  <TableCell>
                    <StatusBadge
                      variant={po.status as Parameters<typeof StatusBadge>[0]["variant"]}
                      label={PO_STATUS_LABELS[po.status] ?? po.status}
                    />
                  </TableCell>
                )}
                {col("lineItems") && (
                  <TableCell className="text-right text-slate-600">
                    {po.lineItems.length}
                  </TableCell>
                )}
                {col("grandTotal") && (
                  <TableCell className="text-right font-medium">
                    {formatCurrency(po.grandTotal)}
                  </TableCell>
                )}
                {col("payment") && (
                  <TableCell className="text-slate-600">{paymentLabel(po)}</TableCell>
                )}
                {col("poDate") && (
                  <TableCell className="text-slate-500">
                    {po.poDate ? formatDate(po.poDate) : "—"}
                  </TableCell>
                )}
                {col("createdAt") && (
                  <TableCell className="text-slate-500">{formatDate(po.createdAt)}</TableCell>
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
        title="Purchase Orders"
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
              entityLabel="Purchase Orders"
              templateColumns={[
                "Purchase Order #",
                "Vendor",
                "Status",
                "Created On",
                "Approved On",
                "Completed On",
                "Due Date",
                "Line Type",
                "Line Name",
                "Part Number",
                "Unit Cost",
                "Ordered Quantity",
                "Ordered Cost",
              ]}
              templateFilename="po-import-template.csv"
              requiredColumns={["Purchase Order #", "Vendor"]}
              onExport={() =>
                exportCSV(
                  (orders ?? []).flatMap((po) => {
                    const lines = po.lineItems.map((li) => ({
                      "Purchase Order #": po.poNumber,
                      Vendor: po.vendorName ?? "",
                      "Line Type": "PART",
                      "Line Name": li.productItemName,
                      "Part Number": li.partNumber ?? "",
                      "Unit Cost": (li.unitCost / 100).toFixed(2),
                      "Ordered Quantity": String(li.quantity),
                    }));
                    if (po.salesTax > 0) {
                      lines.push({
                        "Purchase Order #": po.poNumber,
                        Vendor: po.vendorName ?? "",
                        "Line Type": "PERCENT_TAXABLE",
                        "Line Name": `Sales Tax (${po.taxRatePercent}%)`,
                        "Part Number": "",
                        "Unit Cost": (po.salesTax / 100).toFixed(2),
                        "Ordered Quantity": "1",
                      });
                    }
                    if (po.shippingCost > 0) {
                      lines.push({
                        "Purchase Order #": po.poNumber,
                        Vendor: po.vendorName ?? "",
                        "Line Type": "AMOUNT_TAXABLE",
                        "Line Name": "Shipping",
                        "Part Number": "",
                        "Unit Cost": (po.shippingCost / 100).toFixed(2),
                        "Ordered Quantity": "1",
                      });
                    }
                    return lines;
                  }),
                  "purchase-orders-export.csv"
                )
              }
              onImport={(rows) => bulkImportPOs(rows)}
            />
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New PO
            </Button>
          </div>
        }
      />

      {viewMode === "list" ? (
        <MasterDetailLayout
          listPanel={listPanel}
          detailPanel={selectedPO ? <PODetailPanel key={selectedPO.id} po={selectedPO} /> : null}
          emptyState={
            <EmptyState
              icon={ShoppingCart}
              title="Select a purchase order"
              description="Choose a PO from the list to view its details, line items, and payment tracking."
            />
          }
          hasSelection={!!selectedPO}
          onBack={() => setSelectedPOId(null)}
        />
      ) : (
        tableView
      )}

      {/* Table-mode detail sheet */}
      <Sheet open={!!sheetPO} onOpenChange={(o) => { if (!o) setSheetPOId(null); }}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden p-0 md:w-[580px] md:max-w-[580px]"
        >
          {sheetPO && <PODetailPanel key={sheetPO.id} po={sheetPO} />}
        </SheetContent>
      </Sheet>

      <NewPODialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(po) => setSelectedPOId(po.id)}
      />
    </div>
  );
}
