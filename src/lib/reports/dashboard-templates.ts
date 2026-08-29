import type { DashboardConfig } from "@/types/crm-reports";

// ============================================================
// Starter dashboard templates offered from the "New Dashboard" flow.
// Selecting one pre-fills the builder (not saved until the user hits
// Save) so it's a starting point, not a fixed dashboard.
// ============================================================

export interface DashboardTemplate {
  key: string;
  name: string;
  description: string;
  /** Auto-cloned into every org as a real, editable dashboard on their first
   *  Report Center visit (see ensureSystemDashboardsSeeded). Templates without
   *  this flag stay picker-only starting points, same as before. */
  seedable?: boolean;
  config: DashboardConfig;
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: "sales-overview",
    name: "Sales Overview",
    description: "Estimate pipeline, win rate, and recent activity.",
    seedable: true,
    config: {
      tabs: [
        {
          id: "overview",
          name: "Overview",
          useDateFilter: true,
          panels: [
            {
              id: "new-estimates",
              title: "New Estimates",
              size: "third",
              visual: {
                type: "kpi",
                useTabDateRange: true,
                kpiColumn: "count_all",
                valueColumns: [],
                config: {
                  dataset: "rpt_estimates",
                  columns: [],
                  filters: [],
                  groupBy: [],
                  aggregates: [{ column: "*", fn: "count" }],
                  sortDir: "asc",
                },
              },
            },
            {
              id: "open-value",
              title: "Open Estimate Value",
              size: "third",
              visual: {
                type: "kpi",
                useTabDateRange: true,
                kpiColumn: "sum_total_cents",
                valueColumns: [],
                config: {
                  dataset: "rpt_estimates",
                  columns: [],
                  filters: [{ column: "stage", op: "in", value: ["draft", "quote"] }],
                  groupBy: [],
                  aggregates: [{ column: "total_cents", fn: "sum" }],
                  sortDir: "asc",
                },
              },
            },
            {
              id: "won-value",
              title: "Won Value",
              size: "third",
              visual: {
                type: "kpi",
                useTabDateRange: true,
                kpiColumn: "sum_total_cents",
                valueColumns: [],
                config: {
                  dataset: "rpt_estimates",
                  columns: [],
                  // Estimate stages are org-configurable via crm_estimate_stages
                  // (migration 20260629012636); the old fixed 'won' stage was
                  // merged into 'accepted' in 20260719022236 — 'won' has not
                  // existed as a real stage_key since, so this KPI always
                  // read $0. 'accepted'/'invoiced' matches the same
                  // convention already used by the won-estimates-by-service
                  // and estimate-value-vs-actual report definitions.
                  filters: [{ column: "stage", op: "in", value: ["accepted", "invoiced"] }],
                  groupBy: [],
                  aggregates: [{ column: "total_cents", fn: "sum" }],
                  sortDir: "asc",
                },
              },
            },
            {
              id: "by-stage",
              title: "Estimates by Stage",
              size: "half",
              visual: {
                type: "bar",
                useTabDateRange: true,
                labelColumn: "stage",
                valueColumns: ["sum_total_cents"],
                config: {
                  dataset: "rpt_estimates",
                  columns: [],
                  filters: [],
                  groupBy: ["stage"],
                  aggregates: [
                    { column: "total_cents", fn: "sum" },
                    { column: "*", fn: "count" },
                  ],
                  sortColumn: "sum_total_cents",
                  sortDir: "desc",
                },
              },
            },
            {
              id: "by-source",
              title: "Estimates by Source",
              size: "half",
              visual: {
                type: "pie",
                useTabDateRange: true,
                labelColumn: "source",
                valueColumns: ["count_all"],
                config: {
                  dataset: "rpt_estimates",
                  columns: [],
                  filters: [],
                  groupBy: ["source"],
                  aggregates: [{ column: "*", fn: "count" }],
                  sortColumn: "count_all",
                  sortDir: "desc",
                },
              },
            },
            {
              id: "recent-estimates",
              title: "Recent Estimates",
              size: "full",
              visual: {
                type: "table",
                useTabDateRange: true,
                valueColumns: [],
                config: {
                  dataset: "rpt_estimates",
                  columns: [
                    "estimate_number",
                    "estimate_date",
                    "client_name",
                    "stage",
                    "total_cents",
                    "sales_rep",
                  ],
                  filters: [],
                  groupBy: [],
                  aggregates: [],
                  sortColumn: "estimate_date",
                  sortDir: "desc",
                },
              },
            },
          ],
        },
      ],
    },
  },
  {
    key: "ar-overview",
    name: "A/R Overview",
    description: "Outstanding balances, collections, and payment activity.",
    seedable: true,
    config: {
      tabs: [
        {
          id: "overview",
          name: "Overview",
          useDateFilter: true,
          panels: [
            {
              id: "outstanding-balance",
              title: "Outstanding Balance",
              size: "third",
              visual: {
                type: "kpi",
                useTabDateRange: false,
                kpiColumn: "sum_balance_outstanding_cents",
                valueColumns: [],
                config: {
                  dataset: "rpt_clients",
                  columns: [],
                  filters: [{ column: "status", op: "neq", value: "lead" }],
                  groupBy: [],
                  aggregates: [{ column: "balance_outstanding_cents", fn: "sum" }],
                  sortDir: "asc",
                },
              },
            },
            {
              id: "total-invoiced",
              title: "Total Invoiced",
              size: "third",
              visual: {
                type: "kpi",
                useTabDateRange: true,
                kpiColumn: "sum_total_cents",
                valueColumns: [],
                config: {
                  dataset: "rpt_invoices",
                  columns: [],
                  filters: [{ column: "status", op: "neq", value: "void" }],
                  groupBy: [],
                  aggregates: [{ column: "total_cents", fn: "sum" }],
                  sortDir: "asc",
                },
              },
            },
            {
              id: "total-collected",
              title: "Total Collected",
              size: "third",
              visual: {
                type: "kpi",
                useTabDateRange: true,
                kpiColumn: "sum_amount_cents",
                valueColumns: [],
                config: {
                  dataset: "rpt_payments",
                  columns: [],
                  filters: [],
                  groupBy: [],
                  aggregates: [{ column: "amount_cents", fn: "sum" }],
                  sortDir: "asc",
                },
              },
            },
            {
              id: "invoiced-by-status",
              title: "Invoiced by Status",
              size: "half",
              visual: {
                type: "bar",
                useTabDateRange: true,
                labelColumn: "status",
                valueColumns: ["sum_total_cents"],
                config: {
                  dataset: "rpt_invoices",
                  columns: [],
                  filters: [],
                  groupBy: ["status"],
                  aggregates: [
                    { column: "total_cents", fn: "sum" },
                    { column: "*", fn: "count" },
                  ],
                  sortColumn: "sum_total_cents",
                  sortDir: "desc",
                },
              },
            },
            {
              id: "payments-by-method",
              title: "Payments by Method",
              size: "half",
              visual: {
                type: "pie",
                useTabDateRange: true,
                labelColumn: "method",
                valueColumns: ["sum_amount_cents"],
                config: {
                  dataset: "rpt_payments",
                  columns: [],
                  filters: [],
                  groupBy: ["method"],
                  aggregates: [{ column: "amount_cents", fn: "sum" }],
                  sortColumn: "sum_amount_cents",
                  sortDir: "desc",
                },
              },
            },
            {
              id: "account-balance-by-type",
              title: "Sum of Account Balance by Account Type",
              size: "half",
              visual: {
                type: "pie",
                useTabDateRange: false,
                labelColumn: "account_type",
                valueColumns: ["sum_balance_outstanding_cents"],
                config: {
                  dataset: "rpt_clients",
                  columns: [],
                  filters: [{ column: "status", op: "neq", value: "lead" }],
                  groupBy: ["account_type"],
                  aggregates: [{ column: "balance_outstanding_cents", fn: "sum" }],
                  sortColumn: "sum_balance_outstanding_cents",
                  sortDir: "desc",
                },
              },
            },
            {
              id: "clients-with-balance",
              title: "Top 10 Clients with a Balance",
              size: "half",
              visual: {
                type: "table",
                useTabDateRange: false,
                valueColumns: [],
                config: {
                  dataset: "rpt_clients",
                  columns: ["display_name", "balance_outstanding_cents", "billing_city", "sales_rep"],
                  filters: [{ column: "balance_outstanding_cents", op: "gt", value: 0 }],
                  groupBy: [],
                  aggregates: [],
                  sortColumn: "balance_outstanding_cents",
                  sortDir: "desc",
                  limit: 10,
                },
              },
            },
          ],
        },
        {
          id: "open-invoices",
          name: "Open Invoices",
          useDateFilter: false,
          panels: [
            {
              id: "open-invoices-report",
              title: "Open Invoices",
              size: "full",
              reportKey: "invoices-with-balances",
              visual: {
                type: "table",
                useTabDateRange: false,
                valueColumns: [],
                config: { dataset: "unused", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
              },
            },
          ],
        },
        {
          id: "aging-report-snapshot",
          name: "Aging Report Snapshot",
          useDateFilter: false,
          panels: [
            {
              id: "aging-report-snapshot-report",
              title: "Aging Report Snapshot",
              size: "full",
              reportKey: "ar-aging-snapshot",
              visual: {
                type: "table",
                useTabDateRange: false,
                valueColumns: [],
                config: { dataset: "unused", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
              },
            },
          ],
        },
        {
          id: "ar-aging-report",
          name: "A/R Aging Report",
          useDateFilter: false,
          panels: [
            {
              id: "ar-aging-report-report",
              title: "A/R Aging Report",
              size: "full",
              reportKey: "ar-aging",
              visual: {
                type: "table",
                useTabDateRange: false,
                valueColumns: [],
                config: { dataset: "unused", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
              },
            },
          ],
        },
        {
          id: "payments-reports",
          name: "Payments Reports",
          useDateFilter: false,
          panels: [
            {
              id: "unapplied-payments-report",
              title: "Unapplied Payments",
              size: "third",
              reportKey: "unapplied-payments",
              visual: {
                type: "table",
                useTabDateRange: false,
                valueColumns: [],
                config: { dataset: "unused", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
              },
            },
            {
              id: "pre-payments-report",
              title: "Pre-Payments",
              size: "third",
              reportKey: "pre-payments",
              visual: {
                type: "table",
                useTabDateRange: false,
                valueColumns: [],
                config: { dataset: "unused", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
              },
            },
            {
              id: "payment-audit-summary-report",
              title: "Payment Audit Summary",
              size: "third",
              reportKey: "payment-audit-summary",
              visual: {
                type: "table",
                useTabDateRange: false,
                valueColumns: [],
                config: { dataset: "unused", columns: [], filters: [], groupBy: [], aggregates: [], sortDir: "asc" },
              },
            },
          ],
        },
      ],
    },
  },
  {
    key: "crew-production-avb",
    name: "Crew Production (AvB)",
    description: "Actual vs. budgeted hours and revenue per man-hour by crew.",
    config: {
      tabs: [
        {
          id: "avb",
          name: "AvB",
          useDateFilter: true,
          panels: [
            {
              id: "rev-per-man-hr-by-crew",
              title: "Actual Revenue / Man Hour by Crew",
              size: "half",
              visual: {
                type: "bar",
                useTabDateRange: true,
                labelColumn: "crew_name",
                valueColumns: ["avg_rev_per_man_hr_cents"],
                config: {
                  dataset: "rpt_job_visits",
                  columns: [],
                  filters: [],
                  groupBy: ["crew_name"],
                  aggregates: [{ column: "rev_per_man_hr_cents", fn: "avg" }],
                  sortColumn: "avg_rev_per_man_hr_cents",
                  sortDir: "desc",
                },
              },
            },
            {
              id: "variance-hours-by-crew",
              title: "Actual Time Variance (Hours) by Crew",
              size: "half",
              visual: {
                type: "bar",
                useTabDateRange: true,
                labelColumn: "crew_name",
                valueColumns: ["sum_variance_hours"],
                config: {
                  dataset: "rpt_job_visits",
                  columns: [],
                  filters: [],
                  groupBy: ["crew_name"],
                  aggregates: [{ column: "variance_hours", fn: "sum" }],
                  sortColumn: "sum_variance_hours",
                  sortDir: "desc",
                },
              },
            },
          ],
        },
      ],
    },
  },
];

export function getDashboardTemplate(key: string | undefined): DashboardTemplate | undefined {
  if (!key) return undefined;
  return DASHBOARD_TEMPLATES.find((t) => t.key === key);
}

export function getSeedableDashboardTemplates(): DashboardTemplate[] {
  return DASHBOARD_TEMPLATES.filter((t) => t.seedable);
}
