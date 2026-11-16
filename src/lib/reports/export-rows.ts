import type { ReportColumnDef, ReportFieldType, ReportResult } from "@/types/crm-reports";

// ============================================================
// Totals-row helpers shared by the on-screen table, CSV/Excel/PDF exports,
// and the scheduled-report cron — so every surface places the "Totals"
// label in the same cell and formats the same numbers. Pure functions, no
// React/browser dependency (safe from server-only code).
// ============================================================

export const TOTALS_LABEL = "Totals";

/** Index of the column that should carry the "Totals" label. Prefers the
 *  result's section column (subtotal-mode reports), otherwise the first
 *  non-totalable column. Returns -1 when every column is totalable (an
 *  ungrouped all-aggregate query) — callers then prepend the label to the
 *  first cell rather than overwrite that cell's total. */
export function totalsLabelIndex(
  columns: ReportColumnDef[],
  sectionColumn?: string
): number {
  if (sectionColumn) {
    const idx = columns.findIndex((c) => c.key === sectionColumn && !c.totalable);
    if (idx !== -1) return idx;
  }
  return columns.findIndex((c) => !c.totalable);
}

/** One export row of formatted totals in `result.columns` order, or null
 *  when the result has no totals. `formatCell` decides the cell shape —
 *  display strings for CSV/PDF, raw numbers for Excel — while the label
 *  cell is always a string. */
export function buildTotalsRow<T>(
  result: ReportResult,
  formatCell: (value: unknown, type: ReportFieldType) => T,
  label = TOTALS_LABEL
): (T | string)[] | null {
  // A result cut off at the row cap would total only the rows it returned —
  // exports leave the totals off and say it's partial (partialExportRow).
  if (!result.totals || result.truncated) return null;
  const labelIdx = totalsLabelIndex(result.columns, result.sectionColumn);
  return result.columns.map((col, i) => {
    const total = result.totals?.[col.key];
    const hasTotal = col.totalable && total !== undefined && total !== null;
    const formatted: T | string = hasTotal ? formatCell(total, col.type) : "";
    if (i === labelIdx) return label;
    if (labelIdx === -1 && i === 0) return `${label} ${String(formatted)}`.trim();
    return formatted;
  });
}

/** "Partial: first 5,000 of 12,345 rows …" for a result the engine cut off at
 *  its row cap, else null. Same wording on CSV, Excel and PDF exports, and the
 *  scheduled-report emails (run-scheduled.ts). */
export function partialExportNotice(result: Pick<ReportResult, "truncated" | "rowCount" | "totalCount">): string | null {
  if (!result.truncated) return null;
  return (
    `Partial: first ${result.rowCount.toLocaleString("en-US")}` +
    (result.totalCount !== undefined ? ` of ${result.totalCount.toLocaleString("en-US")}` : "") +
    " rows. Totals are left off because they would cover only these rows — narrow the date range or filters for the full result."
  );
}

/** The partial notice as one export row (text in the first cell), or null. */
export function partialExportRow(result: ReportResult): string[] | null {
  const notice = partialExportNotice(result);
  if (!notice) return null;
  return result.columns.map((_, i) => (i === 0 ? notice : ""));
}

/** Rows for a flat (non-grouped) spreadsheet/PDF export: every data row
 *  formatted with `formatCell`, followed by the totals row when there is
 *  one — the same thing the on-screen table shows in its footer. A result
 *  cut off at the row cap gets no totals row and ends with the partial
 *  notice instead. */
export function exportRowsWithTotals<T>(
  result: ReportResult,
  formatCell: (value: unknown, type: ReportFieldType) => T
): (T | string)[][] {
  const rows: (T | string)[][] = result.rows.map((row) =>
    result.columns.map((c) => formatCell(row[c.key], c.type))
  );
  const totals = buildTotalsRow(result, formatCell);
  if (totals) rows.push(totals);
  const partial = partialExportRow(result);
  if (partial) rows.push(partial);
  return rows;
}
