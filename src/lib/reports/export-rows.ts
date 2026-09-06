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
  if (!result.totals) return null;
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

/** Rows for a flat (non-grouped) spreadsheet/PDF export: every data row
 *  formatted with `formatCell`, followed by the totals row when there is
 *  one — the same thing the on-screen table shows in its footer. */
export function exportRowsWithTotals<T>(
  result: ReportResult,
  formatCell: (value: unknown, type: ReportFieldType) => T
): (T | string)[][] {
  const rows: (T | string)[][] = result.rows.map((row) =>
    result.columns.map((c) => formatCell(row[c.key], c.type))
  );
  const totals = buildTotalsRow(result, formatCell);
  if (totals) rows.push(totals);
  return rows;
}
