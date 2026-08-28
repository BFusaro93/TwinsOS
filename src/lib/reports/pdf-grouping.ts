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

  const displayColumns = result.columns.filter((c) => c.key !== sectionKey);

  const grandTotal = displayColumns.map((c, i) => {
    const total = result.totals?.[c.key];
    const hasTotal = c.totalable && total !== undefined && total !== null;
    return i === 0 ? "Totals" : hasTotal ? formatCell(total, c.type) : "";
  });

  const groups: GroupedPdfSection["groups"] = [];
  let currentLabel: string | null = null;
  let currentRows: ReportResult["rows"] = [];

  const flush = () => {
    if (currentLabel === null) return;
    const totals = computeTotals(displayColumns, currentRows);
    const subtotal = displayColumns.map((c, i) => {
      const t = totals?.[c.key];
      const hasTotal = c.totalable && t !== undefined && t !== null;
      return i === 0 ? currentLabel! : hasTotal ? formatCell(t, c.type) : "";
    });
    groups.push({
      label: currentLabel,
      subtotal,
      rows: currentRows.map((row) => displayColumns.map((c) => formatCell(row[c.key], c.type))),
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

  return { columns: displayColumns.map((c) => c.label), grandTotal, groups };
}
