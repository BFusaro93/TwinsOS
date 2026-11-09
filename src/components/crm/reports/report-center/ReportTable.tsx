"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { computeTotals } from "@/lib/reports/engine";
import { TOTALS_LABEL, totalsLabelIndex } from "@/lib/reports/export-rows";
import {
  EMPTY_VIEW,
  aggregateFooters,
  applyRowView,
  formatAggregateValue,
  formatWithView,
  isViewActive,
  numericRange,
  type TableViewState,
  type ViewAggregateFn,
} from "@/lib/reports/table-view";
import { ColumnHeaderMenu } from "./ColumnHeaderMenu";
import { computeSpectrumRanges, matchFormatRule, spectrumColorFor } from "@/lib/reports/cell-colors";
import type { FormatRule, ReportColumnDef, ReportFieldType, ReportResult, ReportResultRow } from "@/types/crm-reports";

const PAGE_SIZE = 100;

const NUMERIC_TYPES: ReportFieldType[] = ["money", "number", "hours", "percent", "bps"];

/** Format a single cell for display (also used by CSV export). */
export function formatCellValue(value: unknown, type: ReportFieldType): string {
  if (value === null || value === undefined) return "—";
  switch (type) {
    case "money":
      return formatCurrency(Number(value));
    case "hours":
      return Number(value).toFixed(2);
    case "percent":
      return `${Number(value).toFixed(1)}%`;
    case "bps":
      return `${(Number(value) / 100).toFixed(1)}%`;
    case "number":
      return Number(value).toLocaleString();
    case "date":
      return formatDate(String(value));
    case "datetime": {
      const str = String(value);
      const d = new Date(str);
      if (isNaN(d.getTime())) return "—";
      const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `${formatDate(str)} ${time}`;
    }
    case "boolean":
      return value === true || value === "true" ? "Yes" : "No";
    default:
      return String(value);
  }
}

/** Cell value for spreadsheet export (Excel/CSV) — numeric types stay as
 *  real numbers (money is converted from cents to dollars) so they sort,
 *  filter, and sum correctly once opened; everything else is the display
 *  string from formatCellValue. */
export function exportCellValue(value: unknown, type: ReportFieldType): string | number {
  if (value === null || value === undefined) return "";
  switch (type) {
    case "money":
      return Number(value) / 100;
    case "hours":
    case "number":
      return Number(value);
    case "percent":
      return Number(value);
    case "bps":
      return Number(value) / 100;
    default:
      return formatCellValue(value, type);
  }
}

/** Per-group subtotals over the FULL result set (not just the rendered
 *  page), keyed by the section value — so the number shown next to a group
 *  header matches the PDF export and doesn't change as the user pages. Rows
 *  arrive pre-sorted by section (see runAnalysis), but grouping by value
 *  here keeps this correct even if they didn't. */
function computeGroupSubtotals(
  rows: ReportResultRow[],
  sectionKey: string,
  columns: ReportColumnDef[]
): Map<string, Record<string, number | null> | undefined> {
  const groups = new Map<string, ReportResultRow[]>();
  for (const row of rows) {
    const section = String(row[sectionKey] ?? "");
    const bucket = groups.get(section);
    if (bucket) bucket.push(row);
    else groups.set(section, [row]);
  }
  const subtotals = new Map<string, Record<string, number | null> | undefined>();
  for (const [section, groupRows] of groups) {
    subtotals.set(section, computeTotals(columns, groupRows));
  }
  return subtotals;
}

function Pager({
  page,
  pageCount,
  rowCount,
  totalCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  rowCount: number;
  /** Rows matched before the engine's limit, when known and larger than rowCount. */
  totalCount?: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground last:border-b-0 last:border-t print:hidden">
      <span className="tabular-nums">
        {totalCount !== undefined && totalCount > rowCount
          ? `Showing first ${rowCount.toLocaleString()} of ${totalCount.toLocaleString()} rows`
          : `${rowCount.toLocaleString()} rows`}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="whitespace-nowrap tabular-nums">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-6 w-6"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Text alignment for a column: the header menu's pick, else numbers right / text left. */
function alignClass(col: ReportColumnDef, view: TableViewState): string {
  const a = view.formats[col.key]?.align;
  if (a === "left") return "text-left";
  if (a === "center") return "text-center";
  if (a === "right") return "text-right";
  return NUMERIC_TYPES.includes(col.type) ? "text-right" : "text-left";
}

export function ReportTable({
  result,
  formatRules,
  colorSpectrumColumns,
  onAggregatesChange,
  initialAggregates,
}: {
  result: ReportResult;
  formatRules?: FormatRule[];
  colorSpectrumColumns?: string[];
  /** Reports the footer summaries picked in the header menu, so the page can
   *  carry them into its CSV/Excel/PDF exports. */
  onAggregatesChange?: (aggregates: Record<string, ViewAggregateFn>) => void;
  /** Footer summaries to start with (e.g. the ones saved with an analysis);
   *  kept when a new result loads. */
  initialAggregates?: Record<string, ViewAggregateFn>;
}) {
  const [page, setPage] = useState(0);
  // Header-menu view (sort / filter / hide / format / merge). Display-only:
  // exports and the saved report stay as run. Reset whenever a new result loads.
  const [view, setView] = useState<TableViewState>(EMPTY_VIEW);

  const initialAggregatesRef = useRef(initialAggregates);
  initialAggregatesRef.current = initialAggregates;
  useEffect(() => {
    setPage(0);
    setView({ ...EMPTY_VIEW, aggregates: initialAggregatesRef.current ?? {} });
  }, [result]);
  useEffect(() => {
    setPage(0);
  }, [view]);
  useEffect(() => {
    onAggregatesChange?.(view.aggregates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.aggregates]);

  const subtotalMode = !!result.groupSubtotals;
  const viewRows = useMemo(
    () => applyRowView(result.rows, result.columns, view, !subtotalMode),
    [result.rows, result.columns, view, subtotalMode]
  );
  const filtered = Object.keys(view.filters).length > 0;

  const spectrumColumnKeys = useMemo(
    () => [
      ...(colorSpectrumColumns ?? []),
      ...Object.entries(view.formats).filter(([, f]) => f.spectrum).map(([key]) => key),
    ],
    [colorSpectrumColumns, view.formats]
  );
  const spectrumRanges = useMemo(
    () => computeSpectrumRanges(viewRows, spectrumColumnKeys),
    [viewRows, spectrumColumnKeys]
  );
  const barRanges = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};
    for (const [key, f] of Object.entries(view.formats)) {
      if (!f.bars) continue;
      const r = numericRange(viewRows, key);
      if (r) out[key] = r;
    }
    return out;
  }, [viewRows, view.formats]);

  const pageCount = Math.max(1, Math.ceil(viewRows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageStart = safePage * PAGE_SIZE;
  const pagedRows = viewRows.slice(pageStart, pageStart + PAGE_SIZE);
  const showPager = viewRows.length > PAGE_SIZE;

  // A sectionColumn (e.g. "crew_name" on the AvB reports) stays a real
  // column — its own header cell — but only ever holds a value on the
  // grand-total/subtotal rows (see below); ordinary data rows leave it
  // blank so the group's label isn't repeated on every row. CSV export
  // still uses result.columns/rows directly, so it's untouched there.
  const sectionKey = result.sectionColumn;
  const hiddenKeys = new Set(view.hidden);
  const displayColumns = useMemo(
    () => result.columns.filter((c) => !hiddenKeys.has(c.key) || c.key === sectionKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result.columns, view.hidden, sectionKey]
  );

  const groupSubtotals = useMemo(
    () =>
      sectionKey && result.groupSubtotals
        ? computeGroupSubtotals(viewRows, sectionKey, displayColumns)
        : null,
    [viewRows, result.groupSubtotals, sectionKey, displayColumns]
  );

  // Totals follow the filter: with a column filter on, the footer sums only
  // the rows still showing.
  const shownTotals = useMemo(
    () => (filtered ? computeTotals(displayColumns, viewRows) : result.totals),
    [filtered, displayColumns, viewRows, result.totals]
  );

  // Where the "Totals" label goes in the footer: the first non-totalable
  // column. When every column is totalable (an ungrouped all-aggregate
  // query) it's -1 and the label is prepended to the first cell instead of
  // overwriting that column's total.
  const totalsLabelIdx = totalsLabelIndex(displayColumns, sectionKey);

  // Header-menu "Aggregate" footers follow the filter (like the Totals row);
  // exports compute theirs over the full result.
  const footers = useMemo(
    () => aggregateFooters(displayColumns, viewRows, view.aggregates),
    [displayColumns, viewRows, view.aggregates]
  );

  const truncated = !!result.truncated;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        {isViewActive(view) && (
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground print:hidden">
            <span>
              {filtered
                ? `Showing ${viewRows.length.toLocaleString()} of ${result.rows.length.toLocaleString()} rows. `
                : ""}
              {view.hidden.length > 0 ? `${view.hidden.length} column${view.hidden.length === 1 ? "" : "s"} hidden. ` : ""}
              Table view only — exports use the full report{onAggregatesChange && view.aggregates && Object.keys(view.aggregates).length > 0 ? ", plus your column summaries" : ""}.
            </span>
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs" onClick={() => setView({ ...EMPTY_VIEW, aggregates: {} })}>
              <RotateCcw className="h-3 w-3" />
              Reset view
            </Button>
          </div>
        )}
        {view.hidden.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5 text-xs print:hidden">
            <span className="text-muted-foreground">Hidden:</span>
            {result.columns
              .filter((c) => hiddenKeys.has(c.key))
              .map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="rounded border px-1.5 py-0.5 hover:bg-muted"
                  onClick={() => setView({ ...view, hidden: view.hidden.filter((k) => k !== c.key) })}
                >
                  {c.label} ✕
                </button>
              ))}
          </div>
        )}
        {truncated && (
          <div
            role="status"
            className="flex items-start gap-2 border-b border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {result.totalCount !== undefined
                ? `Showing the first ${result.rowCount.toLocaleString()} of ${result.totalCount.toLocaleString()} rows`
                : `Partial — first ${result.rowCount.toLocaleString()} rows`}
              {" "}— totals and calculated-column sorting cover only these rows.
              Narrow the filters to see everything.
            </span>
          </div>
        )}
        {showPager && (
          <Pager
            page={safePage}
            pageCount={pageCount}
            rowCount={filtered ? viewRows.length : result.rowCount}
            totalCount={filtered ? undefined : result.totalCount}
            onPageChange={setPage}
          />
        )}
        {viewRows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400 dark:text-neutral-500">
            {result.rows.length > 0 ? "No rows match the column filters." : "No rows for the selected filters."}
          </div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-xs print:text-[8px]">
              <thead>
                <tr className="border-b bg-slate-50 dark:bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {displayColumns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2.5 whitespace-nowrap print:whitespace-normal print:px-1 print:py-1",
                        alignClass(col, view)
                      )}
                    >
                      {col.key === sectionKey ? (
                        col.label
                      ) : (
                        <ColumnHeaderMenu col={col} view={view} canSort={!subtotalMode} onChange={setView} />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              {/* In subtotal mode, the grand total leads the report (matching
                  the legacy SA layout) instead of trailing it in a <tfoot> —
                  ordinary grouped/ungrouped reports keep the trailing <tfoot>
                  below unchanged. */}
              {shownTotals && result.groupSubtotals && (
                <tbody>
                  <tr className="border-b bg-slate-200 dark:bg-neutral-700 font-semibold text-slate-800 dark:text-neutral-100">
                    {displayColumns.map((col) => {
                      const total = shownTotals?.[col.key];
                      const hasTotal = col.totalable && total !== undefined && total !== null;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-2.5",
                            alignClass(col, view),
                            NUMERIC_TYPES.includes(col.type) && "tabular-nums"
                          )}
                        >
                          {col.key === sectionKey
                            ? "Totals"
                            : hasTotal
                              ? formatCellValue(total, col.type)
                              : ""}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              )}
              <tbody>
                {pagedRows.map((row, i) => {
                  const section = sectionKey ? String(row[sectionKey] ?? "") : null;
                  // Look back across the page boundary so a group that
                  // started on the previous page is recognized as continuing
                  // (its header re-renders at the top of this page, labelled
                  // "(continued)") rather than looking like a fresh group.
                  const prevRow = sectionKey ? viewRows[pageStart + i - 1] : undefined;
                  const prevSection = prevRow ? String(prevRow[sectionKey!] ?? "") : null;
                  const isGroupStart = section !== null && section !== prevSection;
                  const isContinued = section !== null && i === 0 && !isGroupStart;
                  const showSectionHeader = isGroupStart || isContinued;
                  // The section's subtotal renders as ONE combined row with the
                  // header at the start of the group (crew name + its sums
                  // together), matching the legacy SA layout, rather than a
                  // plain divider followed by a separate subtotal row at the end.
                  // Subtotals span the group's rows on every page, not just this one.
                  const subtotal = showSectionHeader && groupSubtotals
                    ? groupSubtotals.get(section!)
                    : null;
                  return (
                    <Fragment key={i}>
                      {showSectionHeader && (
                        <tr className="border-b bg-muted font-semibold text-slate-700 dark:text-neutral-300">
                          {displayColumns.map((col) => {
                            const total = subtotal?.[col.key];
                            const hasTotal = col.totalable && total !== undefined && total !== null;
                            return (
                              <td
                                key={col.key}
                                className={cn(
                                  "px-3 py-1.5",
                                  alignClass(col, view),
                                  NUMERIC_TYPES.includes(col.type) && "tabular-nums"
                                )}
                              >
                                {col.key === sectionKey
                                  ? isContinued
                                    ? `${section} (continued)`
                                    : section
                                  : hasTotal
                                    ? formatCellValue(total, col.type)
                                    : ""}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      <tr className="border-b last:border-0 hover:bg-slate-50 dark:hover:bg-muted/40">
                        {displayColumns.map((col) => {
                          const ruleMatch = matchFormatRule(row[col.key], col.key, formatRules);
                          const cellValue = row[col.key];
                          const spectrumRange = !ruleMatch ? spectrumRanges[col.key] : undefined;
                          const spectrumMatch =
                            spectrumRange && typeof cellValue === "number"
                              ? spectrumColorFor(cellValue, spectrumRange)
                              : null;
                          const colFmt = view.formats[col.key];
                          const barRange = barRanges[col.key];
                          const barPct =
                            colFmt?.bars && barRange && typeof cellValue === "number"
                              ? barRange.max === barRange.min
                                ? 100
                                : ((cellValue - barRange.min) / (barRange.max - barRange.min)) * 100
                              : null;
                          const style = ruleMatch
                            ? { backgroundColor: ruleMatch.bg, color: ruleMatch.text, fontWeight: 600 }
                            : spectrumMatch
                              ? { backgroundColor: spectrumMatch.bg, color: spectrumMatch.text }
                              : barPct !== null
                                ? {
                                    backgroundImage: `linear-gradient(90deg, hsl(217 70% 80% / 0.9) ${barPct}%, transparent ${barPct}%)`,
                                  }
                                : undefined;
                          // Merge Duplicate Cells: a value equal to the row above shows once.
                          const prev = viewRows[pageStart + i - 1];
                          const repeated =
                            view.merged.includes(col.key) &&
                            i > 0 &&
                            prev !== undefined &&
                            prev[col.key] === cellValue &&
                            !(cellValue === null || cellValue === undefined);
                          const text =
                            col.key === sectionKey
                              ? ""
                              : repeated
                                ? ""
                                : (formatWithView(cellValue, col, colFmt?.number) ??
                                  formatCellValue(cellValue, col.type));
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "px-3 py-2 text-slate-700 dark:text-neutral-300 print:px-1 print:py-1",
                                alignClass(col, view),
                                NUMERIC_TYPES.includes(col.type) && "tabular-nums"
                              )}
                              style={style}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
              {((shownTotals && !result.groupSubtotals) || footers.length > 0) && (
                <tfoot>
                  {shownTotals && !result.groupSubtotals && (
                  <tr className="border-t bg-slate-50 dark:bg-muted/40 font-medium text-slate-800 dark:text-neutral-100">
                    {displayColumns.map((col, i) => {
                      const total = shownTotals?.[col.key];
                      const hasTotal = col.totalable && total !== undefined && total !== null;
                      const formatted = hasTotal ? formatCellValue(total, col.type) : "";
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-2.5",
                            alignClass(col, view),
                            NUMERIC_TYPES.includes(col.type) && "tabular-nums"
                          )}
                        >
                          {i === totalsLabelIdx
                            ? TOTALS_LABEL
                            : totalsLabelIdx === -1 && i === 0
                              ? `${TOTALS_LABEL} ${formatted}`.trim()
                              : formatted}
                        </td>
                      );
                    })}
                  </tr>
                  )}
                  {footers.map((footer) => {
                    const labelIdx = displayColumns.findIndex((c) => footer.values[c.key] === undefined);
                    return (
                      <tr
                        key={footer.fn}
                        className="border-t bg-slate-50 dark:bg-muted/40 text-slate-700 dark:text-neutral-200"
                      >
                        {displayColumns.map((col, i) => {
                          const v = footer.values[col.key];
                          const text = formatAggregateValue(v ?? null, footer.fn, col.type, formatCellValue);
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "px-3 py-2",
                                alignClass(col, view),
                                NUMERIC_TYPES.includes(col.type) && "tabular-nums"
                              )}
                            >
                              {i === labelIdx
                                ? footer.label
                                : labelIdx === -1 && i === 0
                                  ? `${footer.label} ${text}`.trim()
                                  : text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tfoot>
              )}
            </table>
          </div>
        )}
        {showPager && (
          <Pager
            page={safePage}
            pageCount={pageCount}
            rowCount={filtered ? viewRows.length : result.rowCount}
            totalCount={filtered ? undefined : result.totalCount}
            onPageChange={setPage}
          />
        )}
      </div>
      {result.notes && result.notes.length > 0 && (
        <ul className="space-y-0.5 px-1 text-[11px] text-muted-foreground">
          {result.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
