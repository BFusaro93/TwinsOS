import type {
  AnalysisFilter,
  ReportColumnDef,
  ReportResult,
  ReportResultRow,
} from "@/types/crm-reports";
import { computeTotals } from "@/lib/reports/engine";
import type { ReportParams } from "@/lib/reports/definition-types";
import { isoNy, nyDateParts, ymd } from "@/lib/reports/ny-date";
import type { InvoiceStatus } from "@/types/crm-invoices";

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

/** Value the filter bar writes to the `range` param when the user picks
 *  "All Time" (or clears both custom dates) — the only way to distinguish
 *  "no bounds, on purpose" from "no dates given, use the report's default
 *  window", since the run hook drops empty `from`/`to` params entirely. */
export const ALL_TIME_RANGE_PARAM = "all";

/** Resolve `from`/`to` params, falling back to a preset window.
 *
 * Explicit `from`/`to` always win. With neither given, `range=all` means an
 * unbounded window; otherwise the report's own `preset` applies.
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
  if (!from && !to && params.range === ALL_TIME_RANGE_PARAM) {
    return { from: null, to: null };
  }
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

// ============================================================
// Revenue / cash recognition rules — the single TS home for both.
// The `rpt_*` views apply the same rules as `is_issued` (rpt_invoices,
// rpt_invoice_line_items) and `is_cash` / `net_amount_cents` (rpt_payments).
//
// Rule A — Issued-invoice rule: an invoice counts as revenue / receivable
//   only when `status NOT IN ('draft', 'void')`. Drafts are "uninvoiced
//   work" (Income Not Invoiced shows them); they are never AR or revenue.
//
// Rule B — Cash rule: a `crm_payments` row counts as cash received only
//   when `is_credit = false` AND `method <> 'AR Write-off'`. Cash amounts
//   are net of refunds (`amount_cents - refunded_amount_cents`).
// ============================================================

/** Rule A: the six invoice statuses that count as issued (not draft/void). */
export const ISSUED_INVOICE_STATUSES: readonly InvoiceStatus[] = [
  "printed",
  "sent",
  "viewed",
  "partial",
  "paid",
  "overdue",
];

/** Rule A for view-backed datasets: filter on the view's `is_issued` flag. */
export function issuedInvoiceFilter(column = "is_issued"): AnalysisFilter[] {
  return [{ column, op: "eq", value: true }];
}

/** Rule B for view-backed datasets: filter on rpt_payments' `is_cash` flag. */
export function cashPaymentFilter(column = "is_cash"): AnalysisFilter[] {
  return [{ column, op: "eq", value: true }];
}

/** Payment method that zeroes out bad debt without real money changing hands. */
export const AR_WRITE_OFF_METHOD = "AR Write-off";

/**
 * Rule A / Rule B for bespoke handlers hitting base tables directly — apply
 * inline on the PostgREST builder (kept inline rather than wrapped in a
 * generic helper: structural typing over the builder's generic filter
 * methods trips TS2589):
 *   crm_invoices:  .in("status", ISSUED_INVOICE_STATUSES)
 *                  (or .in("crm_invoices.status", ...) through an !inner join)
 *   crm_payments:  .eq("is_credit", false).neq("method", AR_WRITE_OFF_METHOD)
 *                  and sum netPaymentCents(row) instead of amount_cents.
 */

/** Rule B net-of-refund amount for a `crm_payments` row. */
export function netPaymentCents(row: {
  amount_cents: number | null;
  refunded_amount_cents?: number | null;
}): number {
  return (row.amount_cents ?? 0) - (row.refunded_amount_cents ?? 0);
}

/** The standard dateRange filter def used by most reports. */
export function dateRangeFilterDef(
  label = "Date Range",
  defaultValue: DateRangePreset = "this_month"
) {
  return { key: "dateRange", label, type: "dateRange" as const, defaultValue };
}
