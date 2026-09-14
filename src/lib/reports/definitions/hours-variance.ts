import type { PrebuiltReportDef, ReportHeaderVisual } from "@/lib/reports/definition-types";
import { dateRangeFilterDef, dateRangeFilters, eqFilter } from "@/lib/reports/helpers";
import { isoNy, mondayOfYmd, nyDateParts, shiftYmd, ymd } from "@/lib/reports/ny-date";
import type { AnalysisFilter } from "@/types/crm-reports";

// ============================================================
// Hours Variance section — pre-built reports.
//
// Fixed-window "Actual v. Budgeted Hours" reports, matching the crew
// production reports pulled daily/weekly from the old SA setup. Each
// variant is a fixed date window (not a date-range filter) grouped by
// crew with per-crew subtotal rows, same shape as the legacy exports.
//
// All "today"/week/month boundaries are computed against the calendar date
// as it appears in America/New_York (this org's operating timezone), not
// the server's local/UTC date — see `src/lib/reports/ny-date.ts`.
// ============================================================

// Matches the color-coding on the legacy SA export: over-budget (actual ran
// longer than budgeted, negative variance) in red, under-budget (finished
// under the budgeted hours, positive variance) in green, and an exact match
// (actual == budgeted) in yellow.
const AVB_FORMAT_RULES: PrebuiltReportDef["formatRules"] = [
  { column: "variance_hours", op: "lt", value: 0, color: "red" },
  { column: "variance_hours", op: "gt", value: 0, color: "green" },
  { column: "variance_hours", op: "eq", value: 0, color: "yellow" },
];

/** Only visits that have (or are accruing) actual hours belong in an
 *  actual-vs-budget comparison. Scheduled/dispatched visits have no actuals
 *  yet, and cancelled/skipped visits never will — including them would drag
 *  the budgeted totals up with work that hasn't happened. */
const AVB_STATUS_FILTER: AnalysisFilter = {
  column: "status",
  op: "in",
  value: ["completed", "in_progress"],
};

/** The two SA-style crew bar charts, filtered to the same date window (and
 *  optional crew) as the table below them. */
function avbHeaderVisuals(dateFilters: AnalysisFilter[]): ReportHeaderVisual[] {
  const filters = [AVB_STATUS_FILTER, ...dateFilters];
  return [
    {
      title: "Actual Revenue / Man Hour by Crew",
      visual: {
        type: "bar",
        useTabDateRange: false,
        labelColumn: "crew_name",
        valueColumns: ["rev_per_man_hr"],
        config: {
          dataset: "rpt_job_visits",
          columns: [],
          filters,
          groupBy: ["crew_name"],
          // Ratio of sums, not an average of per-visit ratios: a 15-minute
          // visit and an 8-hour visit must not weigh the same.
          aggregates: [
            { column: "revenue_cents", fn: "sum" },
            { column: "man_hours", fn: "sum" },
          ],
          formulas: [
            {
              name: "rev_per_man_hr",
              left: "sum_revenue_cents",
              operator: "/",
              right: "sum_man_hours",
              displayType: "money",
            },
          ],
          // Formula columns are computed client-side after the RPC returns,
          // so they can't drive the SQL sort — order by revenue instead.
          sortColumn: "sum_revenue_cents",
          sortDir: "desc",
        },
      },
    },
    {
      title: "Actual Time Variance (Hours) by Crew",
      visual: {
        type: "bar",
        useTabDateRange: false,
        labelColumn: "crew_name",
        valueColumns: ["sum_variance_hours"],
        config: {
          dataset: "rpt_job_visits",
          columns: [],
          filters,
          groupBy: ["crew_name"],
          aggregates: [{ column: "variance_hours", fn: "sum" }],
          sortColumn: "sum_variance_hours",
          sortDir: "desc",
        },
      },
    },
  ];
}

const AVB_NOTES = [
  "Grouped by crew (Assigned Resources), with a subtotal row per crew.",
  "Only completed and in-progress visits are included — scheduled, dispatched, cancelled, and skipped visits have no actual hours to compare.",
  "Budgeted Hours and Actual Hours are both man-hours (duration × number of men).",
  "Hours Variance is Budgeted Hours minus Actual Hours; negative means the visit ran over budget. It is blank until a visit has actual hours.",
  "The Revenue / Man Hour chart is total revenue ÷ total man-hours per crew (not an average of per-visit rates).",
];

const AVB_COLUMNS = [
  "client_name",
  "men_count",
  "actual_start_time",
  "actual_stop_time",
  "budgeted_hours",
  "actual_hours",
  "variance_hours",
  "revenue_cents",
  "budgeted_rev_per_man_hr_cents",
  "rev_per_man_hr_cents",
  "service_code",
];

function avbReport(
  key: string,
  label: string,
  description: string,
  range: () => { from: string; to: string }
): PrebuiltReportDef {
  return {
    key,
    section: "job_hours",
    name: `Actual v. Budgeted Hours (${label})`,
    description,
    filters: [],
    notes: AVB_NOTES,
    formatRules: AVB_FORMAT_RULES,
    // Fixed date window recomputed on every run — safe to schedule daily
    // (unlike the custom-range variant below, which would go stale).
    schedulable: true,
    headerVisuals: () => {
      const { from, to } = range();
      return avbHeaderVisuals([
        { column: "scheduled_date", op: "gte", value: from },
        { column: "scheduled_date", op: "lte", value: to },
      ]);
    },
    analysis: () => {
      const { from, to } = range();
      return {
        dataset: "rpt_job_visits",
        columns: AVB_COLUMNS,
        filters: [
          AVB_STATUS_FILTER,
          { column: "scheduled_date", op: "gte", value: from },
          { column: "scheduled_date", op: "lte", value: to },
        ],
        groupBy: ["crew_name"],
        aggregates: [],
        subtotals: true,
        sortColumn: "client_name",
        sortDir: "asc",
      };
    },
  };
}

export const HOURS_VARIANCE_REPORTS: PrebuiltReportDef[] = [
  avbReport(
    "avb-hours-today",
    "Today",
    "Shows today's visits with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const today = isoNy(new Date());
      return { from: today, to: today };
    }
  ),
  avbReport(
    "avb-hours-yesterday",
    "Yesterday",
    "Shows yesterday's visits with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const yesterday = shiftYmd(isoNy(new Date()), -1);
      return { from: yesterday, to: yesterday };
    }
  ),
  avbReport(
    "avb-hours-week-to-date",
    "Week to Date",
    "Shows this week's visits (Monday through today) with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const today = isoNy(new Date());
      return { from: mondayOfYmd(today), to: today };
    }
  ),
  avbReport(
    "avb-hours-last-week",
    "Last Week",
    "Shows last week's visits (Monday through Sunday) with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const lastMonday = shiftYmd(mondayOfYmd(isoNy(new Date())), -7);
      return { from: lastMonday, to: shiftYmd(lastMonday, 6) };
    }
  ),
  avbReport(
    "avb-hours-month-to-date",
    "Month to Date",
    "Shows this month's visits (the 1st through today) with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const now = new Date();
      const { year, month } = nyDateParts(now);
      return { from: ymd(year, month, 1), to: isoNy(now) };
    }
  ),
  {
    key: "avb-hours-custom",
    section: "job_hours",
    name: "Actual v. Budgeted Hours (Custom Range)",
    description:
      "Shows visits in any date range you pick — defaults to month to date — with budgeted vs actual hours and revenue, grouped by crew.",
    filters: [
      dateRangeFilterDef("Visit Date", "this_month"),
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
    ],
    notes: [
      ...AVB_NOTES,
      "Defaults to month to date (the 1st through today) — pick your own From/To dates to run any range.",
    ],
    formatRules: AVB_FORMAT_RULES,
    headerVisuals: (params) =>
      avbHeaderVisuals([
        ...dateRangeFilters("scheduled_date", params, { preset: "this_month" }),
        ...eqFilter("crew_name", params.crew),
      ]),
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: AVB_COLUMNS,
      filters: [
        AVB_STATUS_FILTER,
        ...dateRangeFilters("scheduled_date", params, { preset: "this_month" }),
        ...eqFilter("crew_name", params.crew),
      ],
      groupBy: ["crew_name"],
      aggregates: [],
      subtotals: true,
      sortColumn: "client_name",
      sortDir: "asc",
    }),
  },
];
