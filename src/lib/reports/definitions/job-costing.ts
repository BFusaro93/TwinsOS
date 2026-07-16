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
        "budget_methods",
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
  {
    key: "production-rate-accuracy",
    section: "job_costing",
    name: "Production Rate Accuracy",
    description:
      "Compares each service's assumed production rate (sq ft per man-hour) against what crews actually achieved, to flag rates that need recalibrating.",
    filters: [dateRangeFilterDef("Scheduled Between", "this_month")],
    notes: [
      "Only includes services set to the 'production_rate' budget method — manual-rate services have nothing to compare against.",
      "Rate Variance is actual vs. assumed, as a percentage. Negative means the job took longer than the assumed rate predicted (the rate may be set too aggressively); positive means it went faster (the rate may be too conservative).",
    ],
    analysis: (params) => ({
      dataset: "rpt_job_services",
      columns: [
        "scheduled_date",
        "client_name",
        "service_name",
        "service_category",
        "qty",
        "service_unit",
        "assumed_production_rate",
        "actual_production_rate",
        "rate_variance_bps",
        "budgeted_hours",
        "job_actual_hours",
        "man_count",
      ],
      filters: [
        { column: "budget_method", op: "eq", value: "production_rate" },
        { column: "job_status", op: "eq", value: "completed" },
        ...dateRangeFilters("scheduled_date", params, { preset: "this_month" }),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "rate_variance_bps",
      sortDir: "asc",
    }),
  },
];
