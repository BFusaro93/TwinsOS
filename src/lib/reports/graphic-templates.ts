import type { VisualSpec } from "@/types/crm-reports";

// ============================================================
// Graphics Library — system catalog of pre-made, panel-level graphics
// (a single VisualSpec) users can drop into any dashboard, new or existing.
// Code-defined and shipped to every org, same spirit as dashboard-templates
// but at the single-panel level. Complemented by crm_saved_graphics, where
// an org can save its own panels for reuse the same way.
// ============================================================

export interface GraphicTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  visual: VisualSpec;
}

export const GRAPHIC_CATEGORIES = [
  "Sales",
  "Accounts Receivable",
  "Estimates",
  "Job Costing",
] as const;

export const GRAPHIC_TEMPLATES: GraphicTemplate[] = [
  {
    key: "new-estimates-kpi",
    name: "New Estimates",
    description: "Count of estimates created in range.",
    category: "Sales",
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
    key: "won-estimate-value-kpi",
    name: "Won Estimate Value",
    description: "Total value of accepted/invoiced estimates in range.",
    category: "Sales",
    visual: {
      type: "kpi",
      useTabDateRange: true,
      kpiColumn: "sum_total_cents",
      valueColumns: [],
      config: {
        dataset: "rpt_estimates",
        columns: [],
        filters: [{ column: "stage", op: "in", value: ["accepted", "invoiced"] }],
        groupBy: [],
        aggregates: [{ column: "total_cents", fn: "sum" }],
        sortDir: "asc",
      },
    },
  },
  {
    key: "estimates-by-stage-bar",
    name: "Estimates by Stage",
    description: "Bar chart of estimate value grouped by pipeline stage.",
    category: "Estimates",
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
    key: "estimates-by-source-pie",
    name: "Estimates by Source",
    description: "Pie chart of estimate count grouped by lead source.",
    category: "Estimates",
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
    key: "outstanding-balance-kpi",
    name: "Outstanding Balance",
    description: "Total client balance currently outstanding.",
    category: "Accounts Receivable",
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
    key: "invoiced-by-status-bar",
    name: "Invoiced by Status",
    description: "Bar chart of invoice total grouped by status.",
    category: "Accounts Receivable",
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
    key: "payments-by-method-pie",
    name: "Payments by Method",
    description: "Pie chart of collected payments grouped by payment method.",
    category: "Accounts Receivable",
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
    key: "new-clients-ytd-gauge",
    name: "New Clients YTD",
    description: "Gauge of new clients acquired against a yearly goal.",
    category: "Sales",
    visual: {
      type: "gauge",
      useTabDateRange: true,
      kpiColumn: "count_all",
      valueColumns: [],
      gaugeMax: 300,
      config: {
        dataset: "rpt_clients",
        columns: [],
        filters: [{ column: "status", op: "neq", value: "lead" }],
        groupBy: [],
        aggregates: [{ column: "*", fn: "count" }],
        sortDir: "asc",
      },
    },
  },
  {
    key: "invoiced-revenue-ytd-gauge",
    name: "Invoiced Revenue YTD",
    description: "Gauge of invoiced revenue against a yearly goal.",
    category: "Accounts Receivable",
    visual: {
      type: "gauge",
      useTabDateRange: true,
      kpiColumn: "sum_total_cents",
      valueColumns: [],
      gaugeMax: 400000000,
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
    key: "actual-vs-budgeted-hours-gauge",
    name: "Actual vs Budgeted Hours",
    description: "Gauge of actual hours worked against budgeted hours for the period.",
    category: "Job Costing",
    visual: {
      type: "gauge",
      useTabDateRange: true,
      kpiColumn: "sum_actual_hours",
      budgetColumn: "sum_budgeted_hours",
      valueColumns: [],
      config: {
        dataset: "rpt_job_visits",
        columns: [],
        filters: [],
        groupBy: [],
        aggregates: [
          { column: "actual_hours", fn: "sum" },
          { column: "budgeted_hours", fn: "sum" },
        ],
        sortDir: "asc",
      },
    },
  },
  {
    key: "actual-vs-budgeted-hours-by-crew-bar",
    name: "Actual vs Budgeted Hours by Crew",
    description: "Bar chart comparing actual and budgeted hours per crew.",
    category: "Job Costing",
    visual: {
      type: "bar",
      useTabDateRange: true,
      labelColumn: "crew_name",
      valueColumns: ["sum_actual_hours", "sum_budgeted_hours"],
      config: {
        dataset: "rpt_job_visits",
        columns: [],
        filters: [],
        groupBy: ["crew_name"],
        aggregates: [
          { column: "actual_hours", fn: "sum" },
          { column: "budgeted_hours", fn: "sum" },
        ],
        sortColumn: "sum_actual_hours",
        sortDir: "desc",
      },
    },
  },
  {
    key: "actual-hours-by-crew-and-service-crosstab",
    name: "Actual Hours by Crew and Service",
    description: "Pivot table of actual hours worked, crews down the side, service codes across the top.",
    category: "Job Costing",
    visual: {
      type: "crosstab",
      useTabDateRange: true,
      labelColumn: "crew_name",
      crosstabHeaderColumn: "service_code",
      valueColumns: ["sum_actual_hours"],
      config: {
        dataset: "rpt_job_visits",
        columns: [],
        filters: [],
        groupBy: ["crew_name", "service_code"],
        aggregates: [{ column: "actual_hours", fn: "sum" }],
        sortDir: "asc",
      },
    },
  },
  {
    key: "clients-with-balance-table",
    name: "Clients with a Balance",
    description: "Table of clients that currently owe a balance.",
    category: "Accounts Receivable",
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
];

export function getGraphicTemplate(key: string | undefined): GraphicTemplate | undefined {
  if (!key) return undefined;
  return GRAPHIC_TEMPLATES.find((t) => t.key === key);
}
