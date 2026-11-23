import { exportCSV } from "@/lib/csv";
import { downloadXLSX } from "@/lib/xlsx-export";

export type BulkExportFormat = "csv" | "xlsx";

type Cell = string | number;

/**
 * Download a bulk selection as CSV or Excel. `headers` are the column titles
 * and every row must give a value for each, in the same order. Money should be
 * passed as dollar numbers so Excel can sum the column.
 */
export async function exportSelection(
  format: BulkExportFormat,
  filenameBase: string,
  sheetName: string,
  headers: string[],
  rows: Cell[][]
): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    exportCSV(
      rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]))),
      `${filenameBase}-${stamp}.csv`
    );
    return;
  }
  await downloadXLSX(`${filenameBase}-${stamp}.xlsx`, [{ name: sheetName, headers, rows }]);
}

/** Cents → dollars as a number (2 dp) for spreadsheet-friendly money cells. */
export const dollars = (cents: number | null | undefined): number => Math.round(cents ?? 0) / 100;
