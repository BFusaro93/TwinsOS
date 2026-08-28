import type { PrebuiltReportDef, ReportHeaderVisual } from "@/lib/reports/definition-types";
import { dateRangeFilterDef, dateRangeFilters, eqFilter } from "@/lib/reports/helpers";
import type { AnalysisFilter } from "@/types/crm-reports";

// ============================================================
// Hours Variance section — pre-built reports.
//
// Fixed-window "Actual v. Budgeted Hours" reports, matching the crew
// production reports pulled daily/weekly from the old SA setup. Each
// variant is a fixed date window (not a date-range filter) grouped by
// crew with per-crew subtotal rows, same shape as the legacy exports.
// ============================================================

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `d` (local time, week starts Monday). */
function mondayOf(d: Date): Date {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

// Matches the color-coding on the legacy SA export: over-budget (actual ran
// longer than budgeted, negative variance) in red, under-budget (finished
// under the budgeted hours, positive variance) in green, and an exact match
// (actual == budgeted) in yellow.
const AVB_FORMAT_RULES: PrebuiltReportDef["formatRules"] = [
  { column: "variance_hours", op: "lt", value: 0, color: "red" },
  { column: "variance_hours", op: "gt", value: 0, color: "green" },
  { column: "variance_hours", op: "eq", value: 0, color: "yellow" },
];

/** The two SA-style crew bar charts, filtered to the same date window (and
 *  optional crew) as the table below them. */
function avbHeaderVisuals(dateFilters: AnalysisFilter[]): ReportHeaderVisual[] {
  return [
    {
      title: "Actual Revenue / Man Hour by Crew",
      visual: {
        type: "bar",
        useTabDateRange: false,
        labelColumn: "crew_name",
        valueColumns: ["avg_rev_per_man_hr_cents"],
        config: {
          dataset: "rpt_job_visits",
          columns: [],
          filters: dateFilters,
          groupBy: ["crew_name"],
          aggregates: [{ column: "rev_per_man_hr_cents", fn: "avg" }],
          sortColumn: "avg_rev_per_man_hr_cents",
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
          filters: dateFilters,
          groupBy: ["crew_name"],
          aggregates: [{ column: "variance_hours", fn: "sum" }],
          sortColumn: "sum_variance_hours",
          sortDir: "desc",
        },
      },
    },
  ];
}

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
    notes: [
      "Grouped by crew (Assigned Resources), with a subtotal row per crew.",
      "Hours Variance is Budgeted Hours minus Actual Hours; negative means the visit ran over budget.",
    ],
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
      const today = iso(new Date());
      return { from: today, to: today };
    }
  ),
  avbReport(
    "avb-hours-yesterday",
    "Yesterday",
    "Shows yesterday's visits with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const yesterday = iso(addDays(new Date(), -1));
      return { from: yesterday, to: yesterday };
    }
  ),
  avbReport(
    "avb-hours-week-to-date",
    "Week to Date",
    "Shows this week's visits (Monday through today) with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const now = new Date();
      return { from: iso(mondayOf(now)), to: iso(now) };
    }
  ),
  avbReport(
    "avb-hours-last-week",
    "Last Week",
    "Shows last week's visits (Monday through Sunday) with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const lastMonday = addDays(mondayOf(new Date()), -7);
      return { from: iso(lastMonday), to: iso(addDays(lastMonday, 6)) };
    }
  ),
  avbReport(
    "avb-hours-month-to-date",
    "Month to Date",
    "Shows this month's visits (the 1st through today) with budgeted vs actual hours and revenue, grouped by crew.",
    () => {
      const now = new Date();
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
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
      "Grouped by crew (Assigned Resources), with a subtotal row per crew.",
      "Hours Variance is Budgeted Hours minus Actual Hours; negative means the visit ran over budget.",
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
