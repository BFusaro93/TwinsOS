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
    key: "drive-time-summary",
    section: "job_hours",
    name: "Drive Time Summary",
    description: "Shows total recorded drive time by crew in any defined time frame — day-level, not billed to clients.",
    filters: [dateRangeFilterDef("Driving Between", "this_month")],
    analysis: (params) => ({
      dataset: "rpt_crew_drive_time",
      columns: [],
      filters: [...dateRangeFilters("work_date", params, { preset: "this_month" })],
      groupBy: ["crew_name"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "minutes", fn: "sum" },
      ],
      sortColumn: "sum_minutes",
      sortDir: "desc",
    }),
  },
  {
    key: "drive-time-detail",
    section: "job_hours",
    name: "Drive Time Detail",
    description: "Shows individual drive segments (start/end and duration) recorded by each crew.",
    filters: [
      dateRangeFilterDef("Driving Between", "this_month"),
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
    ],
    analysis: (params) => ({
      dataset: "rpt_crew_drive_time",
      columns: ["work_date", "crew_name", "started_at", "ended_at", "minutes"],
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
