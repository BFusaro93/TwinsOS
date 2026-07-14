import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import { dateRangeFilterDef, dateRangeFilters, eqFilter } from "@/lib/reports/helpers";

// ============================================================
// Job Costing section — pre-built reports.
// ============================================================

export const JOB_COSTING_REPORTS: PrebuiltReportDef[] = [
  {
    key: "job-costing-report",
    section: "job_costing",
    name: "Job Costing Report",
    description: "Shows the material and labor cost of each job with budget vs actual detail.",
    filters: [],
    href: "/crm/reports/job-costing",
  },
  {
    key: "cogs",
    section: "job_costing",
    name: "Cost of Goods Sold Report",
    description: "Shows revenue and cost by service in any defined time frame.",
    filters: [],
    href: "/crm/reports/cogs",
  },
  {
    key: "job-cost-summary",
    section: "job_costing",
    name: "Job Cost Summary",
    description:
      "Shows completed visits with budgeted vs actual hours, revenue, and labor cost per visit.",
    filters: [
      dateRangeFilterDef("Completed Between", "this_month"),
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
    ],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "scheduled_date",
        "client_name",
        "service_names",
        "crew_name",
        "men_count",
        "budgeted_hours",
        "actual_hours",
        "man_hours",
        "revenue_cents",
        "actual_labor_cost_cents",
        "rev_per_man_hr_cents",
        "variance_hours",
      ],
      filters: [
        { column: "status", op: "eq", value: "completed" },
        ...dateRangeFilters("completed_at", params, { datetime: true, preset: "this_month" }),
        ...eqFilter("crew_name", params.crew),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "scheduled_date",
      sortDir: "desc",
    }),
  },
  {
    key: "service-profitability-summary",
    section: "job_costing",
    name: "Service Profitability Summary",
    description:
      "Shows visit count, revenue, labor cost, and man-hours grouped by service.",
    filters: [dateRangeFilterDef("Completed Between", "this_month")],
    notes: ["Visits with multiple services are grouped by the combined service list."],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [],
      filters: [
        { column: "status", op: "eq", value: "completed" },
        ...dateRangeFilters("completed_at", params, { datetime: true, preset: "this_month" }),
      ],
      groupBy: ["service_names"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "revenue_cents", fn: "sum" },
        { column: "actual_labor_cost_cents", fn: "sum" },
        { column: "man_hours", fn: "sum" },
      ],
      sortColumn: "sum_revenue_cents",
      sortDir: "desc",
    }),
  },
];
