"use client";

import { useRef, useState } from "react";
import { Download, Upload, FileDown, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportCSVTemplate, readCSVFile } from "@/lib/csv";

interface ImportExportMenuProps {
  /** Human-readable entity name, e.g. "Parts" */
  entityLabel: string;
  /** Called with the exported CSV data — caller decides column selection */
  onExport: () => void;
  /** Called with the parsed rows after the user confirms an import.
   *  May return a Promise — the dialog stays in a loading state until it resolves. */
  onImport: (rows: Record<string, string>[]) => Promise<unknown> | void;
  /** Column names for the blank import template download */
  templateColumns: string[];
  /** Template filename, e.g. "parts-template.csv" */
  templateFilename: string;
  /** Expected column names for basic import validation */
  requiredColumns?: string[];
}

/** Normalize a header string for fuzzy matching: lowercase, strip spaces/punctuation, collapse */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Common aliases: maps normalized form → expected camelCase field name */
const COMMON_ALIASES: Record<string, string[]> = {
  assetTag:        ["assettag", "asset tag", "tag", "asset#", "assetno"],
  partNumber:      ["partnumber", "part#", "partno", "part number", "sku"],
  licensePlate:    ["licenseplate", "license plate", "plate", "plate#", "plateno"],
  fuelType:        ["fueltype", "fuel type", "fuel"],
  assignedCrew:    ["assignedcrew", "assigned crew", "crew"],
  quantityOnHand:  ["quantityonhand", "quantity on hand", "qty", "qtyonhand", "onhand", "quantity"],
  minimumStock:    ["minimumstock", "minimum stock", "minstock", "min stock", "reorder"],
  unitCost:        ["unitcost", "unit cost", "cost", "price"],
  vendorName:      ["vendorname", "vendor name", "vendor", "supplier"],
  serialNumber:    ["serialnumber", "serial number", "serial", "serial#"],
  equipmentNumber: ["equipmentnumber", "equipment number", "equip#", "equipno"],
  productItemName: ["productitemname", "product", "item", "itemname", "product name"],
  isInventory:     ["isinventory", "is inventory", "inventory", "tracked"],
  customerName:    ["customername", "customer name", "customer", "client"],
  contactName:     ["contactname", "contact name", "contact"],
  isActive:        ["isactive", "is active", "active", "enabled"],
  woType:          ["wotype", "wo type", "type", "workordertype"],
  assetName:       ["assetname", "asset name", "asset"],
  assignedToName:  ["assignedtoname", "assigned to", "assignee", "assigned"],
  dueDate:         ["duedate", "due date", "due"],
  poDate:          ["podate", "po date"],
  invoiceNumber:   ["invoicenumber", "invoice number", "invoice", "invoice#"],
  paymentType:     ["paymenttype", "payment type", "payment"],
  shippingCost:    ["shippingcost", "shipping cost", "shipping"],
  startDate:       ["startdate", "start date", "start"],
  endDate:         ["enddate", "end date", "end"],
  purchaseVendorName: ["purchasevendorname", "purchase vendor", "purchased from", "dealer"],
  purchaseDate:    ["purchasedate", "purchase date", "date purchased"],
  purchasePrice:   ["purchaseprice", "purchase price", "price paid", "purchase cost"],
  paymentMethod:   ["paymentmethod", "payment method", "payment"],
  financeInstitution: ["financeinstitution", "finance institution", "financed by", "lender"],
  location:        ["location", "loc", "storage location", "warehouse"],
};

/**
 * Auto-map CSV columns to expected fields.
 * Tries exact match, then case-insensitive, then aliases.
 */
export function autoMapColumns(
  csvColumns: string[],
  expectedFields: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalizedCsvMap = new Map<string, string>();
  for (const col of csvColumns) {
    normalizedCsvMap.set(normalizeHeader(col), col);
  }

  for (const field of expectedFields) {
    // 1. Exact match
    if (csvColumns.includes(field)) {
      mapping[field] = field;
      continue;
    }
    // 2. Case-insensitive / normalized match
    const normalizedField = normalizeHeader(field);
    const match = normalizedCsvMap.get(normalizedField);
    if (match) {
      mapping[field] = match;
      continue;
    }
    // 3. Alias matching
    const aliases = COMMON_ALIASES[field] ?? [];
    for (const alias of aliases) {
      const normalizedAlias = normalizeHeader(alias);
      const aliasMatch = normalizedCsvMap.get(normalizedAlias);
      if (aliasMatch) {
        mapping[field] = aliasMatch;
        break;
      }
    }
    // Also try snake_case version of camelCase field
    const snakeVersion = field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    if (!mapping[field]) {
      const snakeMatch = normalizedCsvMap.get(normalizeHeader(snakeVersion));
      if (snakeMatch) {
        mapping[field] = snakeMatch;
      }
    }
  }
  return mapping;
}

/** Remap parsed CSV rows using the column mapping */
export function remapRows(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
): Record<string, string>[] {
  return rows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [field, csvCol] of Object.entries(mapping)) {
      if (csvCol && csvCol !== "__skip__") {
        mapped[field] = row[csvCol] ?? "";
      }
    }
    return mapped;
  });
}

/** Human-readable label for a camelCase field name */
function fieldLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

export function ImportExportMenu({
  entityLabel,
  onExport,
  onImport,
  templateColumns,
  templateFilename,
  requiredColumns,
}: ImportExportMenuProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 1: Mapping
  const [mappingOpen, setMappingOpen] = useState(false);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Step 2: Preview + Import
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    try {
      const rows = await readCSVFile(file);
      if (rows.length === 0) {
        setParseError("The CSV file is empty or has no data rows.");
        setParsedRows([]);
        setPreviewOpen(true);
        return;
      }

      const cols = Object.keys(rows[0]);
      setCsvColumns(cols);
      setRawRows(rows);

      // Auto-map columns
      const autoMapping = autoMapColumns(cols, templateColumns);
      setColumnMapping(autoMapping);

      // If all template columns auto-mapped, check if we can skip the mapping step
      const allMapped = templateColumns.every((f) => autoMapping[f]);
      if (allMapped) {
        // All columns matched — go straight to preview
        proceedToPreview(rows, autoMapping);
      } else {
        // Show mapping dialog
        setMappingOpen(true);
      }
    } catch {
      setParseError("Failed to read the file. Please ensure it is a valid CSV.");
      setParsedRows([]);
      setPreviewOpen(true);
    }
  }

  function proceedToPreview(rows: Record<string, string>[], mapping: Record<string, string>) {
    const remapped = remapRows(rows, mapping);

    if (requiredColumns?.length) {
      const mappedFields = new Set(Object.keys(mapping).filter((k) => mapping[k] && mapping[k] !== "__skip__"));
      const missing = requiredColumns.filter((c) => !mappedFields.has(c));
      if (missing.length) {
        setParseError(`Missing required field mapping: ${missing.map(fieldLabel).join(", ")}. Please map these columns.`);
        setParsedRows([]);
        setPreviewOpen(true);
        return;
      }
    }

    setParseError(null);
    setParsedRows(remapped);
    setMappingOpen(false);
    setPreviewOpen(true);
  }

  function handleMappingConfirm() {
    proceedToPreview(rawRows, columnMapping);
  }

  function updateMapping(field: string, csvCol: string) {
    setColumnMapping((prev) => ({ ...prev, [field]: csvCol === "__skip__" ? "" : csvCol }));
  }

  async function handleConfirmImport() {
    setImporting(true);
    setImportError(null);
    try {
      await onImport(parsedRows);
      setPreviewOpen(false);
      setParsedRows([]);
      setImportError(null);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: string }).message)
            : "Import failed. Please check your data and try again."
      );
    } finally {
      setImporting(false);
    }
  }

  function resetAll() {
    setMappingOpen(false);
    setPreviewOpen(false);
    setRawRows([]);
    setCsvColumns([]);
    setColumnMapping({});
    setParsedRows([]);
    setParseError(null);
    setImportError(null);
  }

  const previewCols = parsedRows.length > 0 ? Object.keys(parsedRows[0]) : [];
  const previewRows = parsedRows.slice(0, 5);

  // Count how many required fields are mapped
  const requiredMapped = (requiredColumns ?? []).filter((c) => columnMapping[c]).length;
  const requiredTotal = (requiredColumns ?? []).length;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <MoreHorizontal className="h-4 w-4" />
            Import / Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="text-xs text-slate-500">
            {entityLabel}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onExport} className="gap-2 text-sm">
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => fileRef.current?.click()}
            className="gap-2 text-sm"
          >
            <Upload className="h-3.5 w-3.5" />
            Import CSV
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => exportCSVTemplate(templateColumns, templateFilename)}
            className="gap-2 text-sm"
          >
            <FileDown className="h-3.5 w-3.5" />
            Download Template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Step 1: Column Mapping Dialog ──────────────────────────────────── */}
      <Dialog open={mappingOpen} onOpenChange={(o) => { if (!o) resetAll(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Map Columns</DialogTitle>
            <DialogDescription>
              Match your CSV columns to the expected fields. {rawRows.length} row{rawRows.length !== 1 ? "s" : ""} found.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto">
            <div className="flex flex-col gap-3">
              {templateColumns.map((field) => {
                const isReq = requiredColumns?.includes(field);
                return (
                  <div key={field} className="grid grid-cols-2 items-center gap-3">
                    <label className="text-sm font-medium text-slate-700">
                      {fieldLabel(field)}
                      {isReq && <span className="text-red-500"> *</span>}
                    </label>
                    <Select
                      value={columnMapping[field] || "__skip__"}
                      onValueChange={(val) => updateMapping(field, val)}
                    >
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Skip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__skip__">
                          <span className="text-slate-400">— Skip —</span>
                        </SelectItem>
                        {csvColumns.map((col) => (
                          <SelectItem key={col} value={col}>
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>

          {requiredTotal > 0 && (
            <p className="text-xs text-slate-500">
              {requiredMapped}/{requiredTotal} required field{requiredTotal !== 1 ? "s" : ""} mapped
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={resetAll}>Cancel</Button>
            <Button
              onClick={handleMappingConfirm}
              disabled={requiredTotal > 0 && requiredMapped < requiredTotal}
            >
              Continue to Preview
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Step 2: Preview + Import Dialog ───────────────────────────────── */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) resetAll(); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {parseError ? "Import Error" : `Import ${entityLabel}`}
            </DialogTitle>
            <DialogDescription>
              {parseError
                ? parseError
                : `${parsedRows.length} row${parsedRows.length !== 1 ? "s" : ""} ready to import. Preview below (first 5 rows).`}
            </DialogDescription>
          </DialogHeader>

          {!parseError && previewRows.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    {previewCols.map((col) => (
                      <th key={col} className="border-b px-3 py-2 text-left font-semibold text-slate-600">
                        {fieldLabel(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {previewCols.map((col) => (
                        <td key={col} className="px-3 py-1.5 text-slate-700">
                          {row[col] || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {importError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {importError}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={resetAll}>
              Cancel
            </Button>
            {!parseError && (
              <Button onClick={handleConfirmImport} disabled={importing}>
                {importing ? "Importing..." : `Import ${parsedRows.length} Row${parsedRows.length !== 1 ? "s" : ""}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
