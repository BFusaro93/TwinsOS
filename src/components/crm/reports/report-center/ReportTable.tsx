"use client";

import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { computeTotals } from "@/lib/reports/engine";
import { FORMAT_COLORS } from "@/types/crm-reports";
import type { FormatRule, ReportColumnDef, ReportFieldType, ReportResult, ReportResultRow } from "@/types/crm-reports";

const PAGE_SIZE = 100;

const NUMERIC_TYPES: ReportFieldType[] = ["money", "number", "hours", "percent", "bps"];

/** First matching rule wins (rules are checked in order). Returns the
 *  background/text color pair to apply to that cell, or null. */
function matchFormatRule(
  value: unknown,
  column: string,
  rules: FormatRule[] | undefined
): { bg: string; text: string } | null {
  if (!rules || rules.length === 0 || typeof value !== "number") return null;
  for (const rule of rules) {
    if (rule.column !== column) continue;
    const matches =
      rule.op === "gt" ? value > rule.value :
      rule.op === "gte" ? value >= rule.value :
      rule.op === "lt" ? value < rule.value :
      rule.op === "lte" ? value <= rule.value :
      rule.op === "eq" ? value === rule.value :
      value !== rule.value;
    if (matches) {
      const color = FORMAT_COLORS.find((c) => c.value === rule.color);
      if (color) return { bg: color.bg, text: color.text };
    }
  }
  return null;
}

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

/** Sums totalable columns across only the current page's rows belonging to
 *  one group — subtotals are computed per rendered page rather than globally,
 *  same page-scoped tradeoff the existing section-header logic already makes. */
function computeGroupSubtotal(
  pageRows: ReportResultRow[],
  sectionKey: string,
  section: string,
  columns: ReportColumnDef[]
): Record<string, number | null> | undefined {
  const groupRows = pageRows.filter((r) => String(r[sectionKey] ?? "") === section);
  return computeTotals(columns, groupRows);
}

function Pager({
  page,
  pageCount,
  rowCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  rowCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs text-muted-foreground last:border-b-0 last:border-t print:hidden">
      <span className="tabular-nums">{rowCount.toLocaleString()} rows</span>
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

export function ReportTable({ result, formatRules }: { result: ReportResult; formatRules?: FormatRule[] }) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [result]);

  const pageCount = Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pagedRows = result.rows.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  );
  const showPager = result.rows.length > PAGE_SIZE;

  // A sectionColumn (e.g. "crew_name" on the AvB reports) stays a real
  // column — its own header cell — but only ever holds a value on the
  // grand-total/subtotal rows (see below); ordinary data rows leave it
  // blank so the group's label isn't repeated on every row. CSV export
  // still uses result.columns/rows directly, so it's untouched there.
  const sectionKey = result.sectionColumn;
  const displayColumns = result.columns;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {showPager && (
          <Pager
            page={safePage}
            pageCount={pageCount}
            rowCount={result.rowCount}
            onPageChange={setPage}
          />
        )}
        {result.rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-400">
            No rows for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {displayColumns.map((col) => (
                    <th
                      key={col.key}
                      className={cn(
                        "px-3 py-2.5 whitespace-nowrap",
                        NUMERIC_TYPES.includes(col.type)
                          ? "text-right"
                          : "text-left"
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {/* In subtotal mode, the grand total leads the report (matching
                  the legacy SA layout) instead of trailing it in a <tfoot> —
                  ordinary grouped/ungrouped reports keep the trailing <tfoot>
                  below unchanged. */}
              {result.totals && result.groupSubtotals && (
                <tbody>
                  <tr className="border-b bg-slate-200 font-semibold text-slate-800">
                    {displayColumns.map((col) => {
                      const total = result.totals?.[col.key];
                      const hasTotal = col.totalable && total !== undefined && total !== null;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-2.5",
                            NUMERIC_TYPES.includes(col.type) &&
                              "text-right tabular-nums"
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
                  const prevSection = sectionKey && i > 0 ? String(pagedRows[i - 1][sectionKey] ?? "") : null;
                  const showSectionHeader = section !== null && section !== prevSection;
                  // The section's subtotal renders as ONE combined row with the
                  // header at the start of the group (crew name + its sums
                  // together), matching the legacy SA layout, rather than a
                  // plain divider followed by a separate subtotal row at the end.
                  const subtotal = result.groupSubtotals && showSectionHeader
                    ? computeGroupSubtotal(pagedRows, sectionKey!, section!, displayColumns)
                    : null;
                  return (
                    <Fragment key={i}>
                      {showSectionHeader && (
                        <tr className="border-b bg-slate-100 font-semibold text-slate-700">
                          {displayColumns.map((col) => {
                            const total = subtotal?.[col.key];
                            const hasTotal = col.totalable && total !== undefined && total !== null;
                            return (
                              <td
                                key={col.key}
                                className={cn(
                                  "px-3 py-1.5",
                                  NUMERIC_TYPES.includes(col.type) && "text-right tabular-nums"
                                )}
                              >
                                {col.key === sectionKey ? section : hasTotal ? formatCellValue(total, col.type) : ""}
                              </td>
                            );
                          })}
                        </tr>
                      )}
                      <tr className="border-b last:border-0 hover:bg-slate-50">
                        {displayColumns.map((col) => {
                          const ruleMatch = matchFormatRule(row[col.key], col.key, formatRules);
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "px-3 py-2 text-slate-700",
                                NUMERIC_TYPES.includes(col.type) &&
                                  "text-right tabular-nums"
                              )}
                              style={ruleMatch ? { backgroundColor: ruleMatch.bg, color: ruleMatch.text, fontWeight: 600 } : undefined}
                            >
                              {col.key === sectionKey ? "" : formatCellValue(row[col.key], col.type)}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
              {result.totals && !result.groupSubtotals && (
                <tfoot>
                  <tr className="border-t bg-slate-50 font-medium text-slate-800">
                    {displayColumns.map((col, i) => {
                      const total = result.totals?.[col.key];
                      const hasTotal = col.totalable && total !== undefined && total !== null;
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            "px-3 py-2.5",
                            NUMERIC_TYPES.includes(col.type) &&
                              "text-right tabular-nums"
                          )}
                        >
                          {i === 0
                            ? "Totals"
                            : hasTotal
                              ? formatCellValue(total, col.type)
                              : ""}
                        </td>
                      );
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {showPager && (
          <Pager
            page={safePage}
            pageCount={pageCount}
            rowCount={result.rowCount}
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
