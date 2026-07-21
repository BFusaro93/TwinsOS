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
  config: DashboardConfig;
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: "sales-overview",
    name: "Sales Overview",
    description: "Estimate pipeline, win rate, and recent activity.",
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
                  filters: [{ column: "stage", op: "in", value: ["draft", "quote", "sent"] }],
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
                  filters: [{ column: "stage", op: "in", value: ["won", "invoiced"] }],
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
              id: "clients-with-balance",
              title: "Clients with a Balance",
              size: "full",
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
