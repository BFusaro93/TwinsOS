import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import { dateRangeFilterDef, dateRangeFilters, eqFilter } from "@/lib/reports/helpers";

// ============================================================
// Job Hours section — pre-built reports.
// ============================================================

export const JOB_HOURS_REPORTS: PrebuiltReportDef[] = [
  {
    key: "job-hours-summary",
    section: "job_hours",
    name: "Job Hours Summary",
    description: "Shows total hours worked and labor cost by employee in any defined time frame.",
    filters: [dateRangeFilterDef("Worked Between", "this_month")],
    analysis: (params) => ({
      dataset: "rpt_timesheets",
      columns: [],
      filters: [...dateRangeFilters("work_date", params, { preset: "this_month" })],
      groupBy: ["member_name"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "hours", fn: "sum" },
        { column: "labor_cost_cents", fn: "sum" },
      ],
      sortColumn: "sum_hours",
      sortDir: "desc",
    }),
  },
  {
    key: "crew-hours-summary",
    section: "job_hours",
    name: "Crew Hours Summary",
    description: "Shows total hours worked and labor cost by crew in any defined time frame.",
    filters: [dateRangeFilterDef("Worked Between", "this_month")],
    analysis: (params) => ({
      dataset: "rpt_timesheets",
      columns: [],
      filters: [...dateRangeFilters("work_date", params, { preset: "this_month" })],
      groupBy: ["crew_name"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "hours", fn: "sum" },
        { column: "labor_cost_cents", fn: "sum" },
      ],
      sortColumn: "sum_hours",
      sortDir: "desc",
    }),
  },
  {
    key: "timesheet-detail",
    section: "job_hours",
    name: "Timesheet Detail",
    description:
      "Shows individual clock-in/out entries with breaks, hours, and labor cost per employee.",
    filters: [
      dateRangeFilterDef("Worked Between", "this_month"),
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
    ],
    analysis: (params) => ({
      dataset: "rpt_timesheets",
      columns: [
        "work_date",
        "member_name",
        "crew_name",
        "client_name",
        "clocked_in_at",
        "clocked_out_at",
        "break_minutes",
        "lunch_minutes",
        "hours",
        "labor_cost_cents",
      ],
      filters: [
        ...dateRangeFilters("work_date", params, { preset: "this_month" }),
        ...eqFilter("crew_name", params.crew),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "work_date",
      sortDir: "desc",
    }),
  },
];
