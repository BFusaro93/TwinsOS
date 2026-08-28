import { computeTotals } from "@/lib/reports/engine";
import type { ReportFieldType, ReportResult } from "@/types/crm-reports";

export interface GroupedPdfSection {
  columns: string[];
  grandTotal: string[];
  groups: { label: string; subtotal: string[]; rows: string[][] }[];
}

/** Builds the "grand total up top, then each group's subtotal immediately
 *  followed by its rows" structure the PDF export renders for subtotal-mode
 *  reports (matching the legacy SA layout) — shared by the on-demand PDF
 *  export button (ReportViewer) and the scheduled-report cron
 *  (run-scheduled), which format cell values differently (client vs.
 *  server), hence the injected `formatCell`. Returns null for a report that
 *  isn't in subtotal mode — callers fall back to a plain flat table. */
export function buildGroupedPdfSection(
  result: ReportResult,
  formatCell: (value: unknown, type: ReportFieldType) => string
): GroupedPdfSection | null {
  const sectionKey = result.sectionColumn;
  if (!sectionKey || !result.groupSubtotals) return null;

  // The section column (e.g. crew_name) stays a real column — its own
  // header — but only ever holds a value on the grand-total/subtotal rows,
  // matching ReportTable's on-screen rendering: blank on every detail row so
  // the group's label isn't repeated down the column.
  const columns = result.columns;

  const grandTotal = columns.map((c) => {
    if (c.key === sectionKey) return "Totals";
    const total = result.totals?.[c.key];
    const hasTotal = c.totalable && total !== undefined && total !== null;
    return hasTotal ? formatCell(total, c.type) : "";
  });

  const groups: GroupedPdfSection["groups"] = [];
  let currentLabel: string | null = null;
  let currentRows: ReportResult["rows"] = [];

  const flush = () => {
    if (currentLabel === null) return;
    const totals = computeTotals(columns, currentRows);
    const subtotal = columns.map((c) => {
      if (c.key === sectionKey) return currentLabel!;
      const t = totals?.[c.key];
      const hasTotal = c.totalable && t !== undefined && t !== null;
      return hasTotal ? formatCell(t, c.type) : "";
    });
    groups.push({
      label: currentLabel,
      subtotal,
      rows: currentRows.map((row) => columns.map((c) => (c.key === sectionKey ? "" : formatCell(row[c.key], c.type)))),
    });
  };

  for (const row of result.rows) {
    const label = String(row[sectionKey] ?? "");
    if (label !== currentLabel) {
      flush();
      currentLabel = label;
      currentRows = [];
    }
    currentRows.push(row);
  }
  flush();

  return { columns: columns.map((c) => c.label), grandTotal, groups };
}
