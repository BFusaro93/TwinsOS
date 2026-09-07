import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import { dateRangeFilterDef, dateRangeFilters, eqFilter } from "@/lib/reports/helpers";

// ============================================================
// Job Costing section — pre-built reports.
// ============================================================

/** Footnote explaining rpt_job_visits.actual_labor_cost_cents' fallback chain
 *  and the `labor_cost_source` flag, so a $0 never passes as a real cost. */
const LABOR_COST_NOTE =
  "Labor Cost is the crew clock-out actual when one was recorded (source \"actual\"); otherwise it is estimated as man-hours × the crew's average labor rate — each member's labor burden rate, or their employee hourly rate grossed up by the org's labor burden % — falling back to the org-wide average (source \"estimated\"). Source \"none\" means no labor rate is configured for the crew or org, so the $0.00 shown is NOT a real cost: set labor burden rates on crew members or hourly rates on employees.";

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
      "Shows completed visits with budgeted vs actual man-hours, revenue, and labor cost per visit.",
    filters: [
      dateRangeFilterDef("Completed Between", "this_month"),
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
    ],
    notes: [
      "Budgeted and Actual Man-Hours are both duration × number of men.",
      "Worked Date is the completion date (Eastern time), or the scheduled date for visits completed without a timestamp — the same date the Job Costing page uses.",
      "Revenue is the visit's own rate for per-service visits, otherwise the live sum of the job's included service lines (so re-pricing a line is reflected), otherwise the job rate.",
      LABOR_COST_NOTE,
    ],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "worked_date",
        "client_name",
        "service_names",
        "budget_methods",
        "crew_name",
        "men_count",
        "budgeted_hours",
        // actual_hours and man_hours are the same figure in rpt_job_visits —
        // show it once.
        "actual_hours",
        "revenue_cents",
        "actual_labor_cost_cents",
        "labor_cost_source",
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
      sortColumn: "worked_date",
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
    notes: [
      "Visits with multiple services are grouped by the combined service list.",
      LABOR_COST_NOTE,
    ],
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
      "One row per completed visit × service. A recurring job's visits still in progress or not yet done are excluded, even if the job itself is marked complete.",
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
        // job_actual_hours stays NULL (blank) when a visit has no hours;
        // actual_man_hours is the same share coalesced to 0.
        "job_actual_hours",
        "man_count",
      ],
      filters: [
        { column: "budget_method", op: "eq", value: "production_rate" },
        // Per-visit status, not the job master's: a recurring job's status
        // stays 'scheduled' while individual visits complete (and a
        // completed job can still have skipped visits with no hours).
        { column: "visit_status", op: "eq", value: "completed" },
        ...dateRangeFilters("scheduled_date", params, { preset: "this_month" }),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "rate_variance_bps",
      sortDir: "asc",
    }),
  },
  {
    key: "wip-schedule",
    section: "job_costing",
    name: "WIP Report",
    description:
      "Work-in-progress schedule for Projects: percent complete by cost-to-cost, earned revenue, and whether each job is over- or under-billed.",
    filters: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "sold", label: "Sold" },
          { value: "scheduled", label: "Scheduled" },
          { value: "in_progress", label: "In Progress" },
          { value: "complete", label: "Complete" },
          { value: "on_hold", label: "On Hold" },
          { value: "canceled", label: "Canceled" },
        ],
      },
    ],
    notes: [
      "% Complete is cost-to-date ÷ EAC (estimated cost at completion) — not the manual progress field on the project.",
      "Over/(Under) Billed is billed to date minus earned revenue. Positive means billings are ahead of the work (healthy); negative means the work is ahead of billing (you're financing the job).",
      "EAC is seeded from the linked estimate when a job is converted, then re-forecastable on the project — projects with no EAC set show 0% complete.",
    ],
    analysis: (params) => ({
      dataset: "rpt_projects_wip",
      columns: [
        "name",
        "status",
        "client_name",
        "contract_cents",
        "eac_cents",
        "estimated_gp_pct",
        "cost_to_date_cents",
        "pct_complete",
        "earned_revenue_cents",
        "billed_cents",
        "over_under_billed_cents",
        "remaining_to_bill_cents",
      ],
      filters: [...eqFilter("status", params.status)],
      groupBy: [],
      aggregates: [],
      sortColumn: "over_under_billed_cents",
      sortDir: "asc",
    }),
  },
];
