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

export function ImportExportMenu({
  entityLabel,
  onExport,
  onImport,
  templateColumns,
  templateFilename,
  requiredColumns,
}: ImportExportMenuProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so same file can be re-selected
    e.target.value = "";

    try {
      const rows = await readCSVFile(file);
      if (rows.length === 0) {
        setParseError("The CSV file is empty or has no data rows.");
        setParsedRows([]);
        setPreviewOpen(true);
        return;
      }

      if (requiredColumns?.length) {
        const fileColumns = Object.keys(rows[0]);
        const missing = requiredColumns.filter((c) => !fileColumns.includes(c));
        if (missing.length) {
          setParseError(`Missing required columns: ${missing.join(", ")}`);
          setParsedRows([]);
          setPreviewOpen(true);
          return;
        }
      }

      setParseError(null);
      setParsedRows(rows);
      setPreviewOpen(true);
    } catch {
      setParseError("Failed to read the file. Please ensure it is a valid CSV.");
      setParsedRows([]);
      setPreviewOpen(true);
    }
  }

  async function handleConfirmImport() {
    setImporting(true);
    try {
      await onImport(parsedRows);
      setPreviewOpen(false);
      setParsedRows([]);
    } finally {
      setImporting(false);
    }
  }

  const previewCols = parsedRows.length > 0 ? Object.keys(parsedRows[0]) : [];
  const previewRows = parsedRows.slice(0, 5);

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

      {/* Import preview / error dialog */}
      <Dialog open={previewOpen} onOpenChange={(o) => { if (!o) { setPreviewOpen(false); setParsedRows([]); setParseError(null); } }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {parseError ? "Import Error" : `Import ${entityLabel}`}
            </DialogTitle>
            <DialogDescription>
              {parseError
                ? parseError
                : `${parsedRows.length} row${parsedRows.length !== 1 ? "s" : ""} found. Preview below (first 5 rows).`}
            </DialogDescription>
          </DialogHeader>

          {!parseError && previewRows.length > 0 && (
            <div className="max-h-64 overflow-auto rounded-md border text-xs">
              <table className="w-full">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    {previewCols.map((col) => (
                      <th key={col} className="border-b px-3 py-2 text-left font-semibold text-slate-600">
                        {col}
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

          <DialogFooter>
            <Button variant="outline" onClick={() => { setPreviewOpen(false); setParsedRows([]); setParseError(null); }}>
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
