import type {
  AnalysisFilter,
  ReportColumnDef,
  ReportResult,
  ReportResultRow,
} from "@/types/crm-reports";
import { computeTotals } from "@/lib/reports/engine";
import type { ReportParams } from "@/lib/reports/definition-types";
import { isoNy, nyDateParts, ymd } from "@/lib/reports/ny-date";

// ============================================================
// Shared helpers for report definitions.
// ============================================================

export type DateRangePreset =
  | "this_month"
  | "last_month"
  | "last_30"
  | "last_90"
  | "this_year"
  | "all_time";

/** Resolve `from`/`to` params, falling back to a preset window.
 *
 * All "today"/month/year boundaries are computed against the calendar date
 * as it appears in America/New_York (this org's operating timezone), not
 * the server's local/UTC date — see `src/lib/reports/ny-date.ts`.
 */
export function resolveDateRange(
  params: ReportParams,
  preset: DateRangePreset = "this_month"
): { from: string | null; to: string | null } {
  let from = params.from || null;
  let to = params.to || null;
  if (!from && !to && preset !== "all_time") {
    const now = new Date();
    to = isoNy(now);
    const { year, month } = nyDateParts(now);
    if (preset === "this_month") {
      from = ymd(year, month, 1);
    } else if (preset === "last_month") {
      from = ymd(year, month - 1, 1);
      to = ymd(year, month, 0);
    } else if (preset === "last_30") {
      from = isoNy(new Date(now.getTime() - 30 * 86400000));
    } else if (preset === "last_90") {
      from = isoNy(new Date(now.getTime() - 90 * 86400000));
    } else if (preset === "this_year") {
      from = ymd(year, 0, 1);
    }
  }
  return { from, to };
}

/**
 * Build gte/lte filters for a date (or timestamptz) column from `from`/`to`
 * params. For datetime columns the `to` bound is pushed to end-of-day so the
 * final day is inclusive.
 */
export function dateRangeFilters(
  column: string,
  params: ReportParams,
  opts: { preset?: DateRangePreset; datetime?: boolean } = {}
): AnalysisFilter[] {
  const { from, to } = resolveDateRange(params, opts.preset ?? "this_month");
  const filters: AnalysisFilter[] = [];
  if (from) filters.push({ column, op: "gte", value: from });
  if (to) {
    filters.push({
      column,
      op: "lte",
      value: opts.datetime ? `${to} 23:59:59.999` : to,
    });
  }
  return filters;
}

/** Equality filter only when the param has a non-empty, non-"all" value. */
export function eqFilter(
  column: string,
  value: string | undefined
): AnalysisFilter[] {
  if (!value || value === "all") return [];
  return [{ column, op: "eq", value }];
}

/** ilike filter only when the param has a value. */
export function containsFilter(
  column: string,
  value: string | undefined
): AnalysisFilter[] {
  if (!value) return [];
  return [{ column, op: "contains", value }];
}

/** Shorthand for bespoke handlers' column defs. */
export function col(
  key: string,
  label: string,
  type: ReportColumnDef["type"] = "text",
  totalable?: boolean
): ReportColumnDef {
  return {
    key,
    label,
    type,
    totalable: totalable ?? (type === "money" || type === "hours"),
  };
}

/** Assemble a ReportResult from bespoke-handler rows. */
export function buildResult(
  columns: ReportColumnDef[],
  rows: ReportResultRow[],
  notes?: string[],
  sectionColumn?: string
): ReportResult {
  return {
    columns,
    rows,
    totals: computeTotals(columns, rows),
    rowCount: rows.length,
    generatedAt: new Date().toISOString(),
    notes,
    sectionColumn,
  };
}

/** Month labels for matrix reports (Jan..Dec). */
export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** The standard dateRange filter def used by most reports. */
export function dateRangeFilterDef(
  label = "Date Range",
  defaultValue: DateRangePreset = "this_month"
) {
  return { key: "dateRange", label, type: "dateRange" as const, defaultValue };
}
