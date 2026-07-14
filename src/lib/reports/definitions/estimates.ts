import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
  resolveDateRange,
} from "@/lib/reports/helpers";

// ============================================================
// Estimates section — pre-built reports.
// ============================================================

const STAGE_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "quote", label: "Quote" },
  { value: "sent", label: "Sent" },
  { value: "approved", label: "Approved" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "invoiced", label: "Invoiced" },
];

export const ESTIMATE_REPORTS: PrebuiltReportDef[] = [
  {
    key: "estimates-by-stage",
    section: "estimates",
    name: "Estimates by Stage",
    description:
      "Shows all estimates in the pipeline with their stage, value, probability, and age.",
    filters: [
      dateRangeFilterDef("Estimate Date", "this_year"),
      { key: "stage", label: "Stage", type: "select", options: STAGE_OPTIONS },
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_estimates",
      columns: [
        "stage",
        "estimate_number",
        "estimate_date",
        "client_name",
        "client_status",
        "source",
        "total_cents",
        "probability_pct",
        "age_days",
        "sales_rep",
      ],
      filters: [
        ...dateRangeFilters("estimate_date", params, { preset: "this_year" }),
        ...eqFilter("stage", params.stage),
        ...eqFilter("sales_rep", params.sales_rep),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "stage",
      sortDir: "asc",
    }),
  },
  {
    key: "won-estimates-by-service",
    section: "estimates",
    name: "Won Estimates by Service",
    description:
      "Shows every service line on won and invoiced estimates with hours, cost, and value.",
    filters: [
      dateRangeFilterDef("Estimate Date", "this_year"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_estimate_line_items",
      columns: [
        "service_name",
        "estimate_number",
        "estimate_date",
        "client_name",
        "qty",
        "rate_cents",
        "visits",
        "total_budgeted_hours",
        "total_cost_cents",
        "total_cents",
        "sales_rep",
      ],
      filters: [
        { column: "estimate_stage", op: "in", value: ["won", "invoiced"] },
        ...dateRangeFilters("estimate_date", params, { preset: "this_year" }),
        ...eqFilter("sales_rep", params.sales_rep),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "service_name",
      sortDir: "asc",
    }),
  },
  {
    key: "won-estimates-service-summary",
    section: "estimates",
    name: "Won Estimates by Service (Summary)",
    description:
      "Totals won and invoiced estimate lines by service — line count, value, hours, and cost.",
    filters: [
      dateRangeFilterDef("Estimate Date", "this_year"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_estimate_line_items",
      columns: [],
      filters: [
        { column: "estimate_stage", op: "in", value: ["won", "invoiced"] },
        ...dateRangeFilters("estimate_date", params, { preset: "this_year" }),
        ...eqFilter("sales_rep", params.sales_rep),
      ],
      groupBy: ["service_name"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "total_cents", fn: "sum" },
        { column: "total_budgeted_hours", fn: "sum" },
        { column: "total_cost_cents", fn: "sum" },
      ],
      sortColumn: "sum_total_cents",
      sortDir: "desc",
    }),
  },
  {
    key: "estimate-value-vs-actual",
    section: "estimates",
    name: "Won Estimates — Estimated vs Invoiced Value",
    description:
      "Compares each won estimate's value against what was actually invoiced and paid.",
    filters: [dateRangeFilterDef("Estimate Date", "this_year")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      let query = supabase
        .from("estimates")
        .select("id, estimate_number, estimate_date, total_cents, clients:client_id(display_name)")
        .in("stage", ["won", "invoiced"])
        .is("deleted_at", null);
      if (from) query = query.gte("estimate_date", from);
      if (to) query = query.lte("estimate_date", to);
      const { data, error } = await query
        .order("estimate_date", { ascending: false })
        .limit(5000);
      if (error) throw new Error(error.message);

      type EstimateRow = {
        id: string;
        estimate_number: number | null;
        estimate_date: string | null;
        total_cents: number | null;
        clients: { display_name: string | null } | null;
      };
      const estimates = (data ?? []) as unknown as EstimateRow[];

      const invoicedByEstimate = new Map<string, number>();
      const paidByEstimate = new Map<string, number>();
      const ids = estimates.map((e) => e.id);
      if (ids.length > 0) {
        const { data: invData, error: invError } = await supabase
          .from("crm_invoices")
          .select("estimate_id, total_cents, amount_paid_cents, status")
          .in("estimate_id", ids)
          .neq("status", "void")
          .is("deleted_at", null)
          .limit(5000);
        if (invError) throw new Error(invError.message);

        type InvoiceRow = {
          estimate_id: string | null;
          total_cents: number | null;
          amount_paid_cents: number | null;
          status: string | null;
        };
        for (const inv of (invData ?? []) as unknown as InvoiceRow[]) {
          if (!inv.estimate_id) continue;
          invoicedByEstimate.set(
            inv.estimate_id,
            (invoicedByEstimate.get(inv.estimate_id) ?? 0) + (inv.total_cents ?? 0)
          );
          paidByEstimate.set(
            inv.estimate_id,
            (paidByEstimate.get(inv.estimate_id) ?? 0) + (inv.amount_paid_cents ?? 0)
          );
        }
      }

      const rows = estimates.map((e) => {
        const estimated = e.total_cents ?? 0;
        const invoiced = invoicedByEstimate.get(e.id) ?? 0;
        return {
          estimate_number: e.estimate_number,
          estimate_date: e.estimate_date,
          client_name: e.clients?.display_name ?? "",
          estimated_cents: estimated,
          invoiced_cents: invoiced,
          paid_cents: paidByEstimate.get(e.id) ?? 0,
          variance_cents: invoiced - estimated,
        };
      });

      return buildResult(
        [
          col("estimate_number", "Estimate #", "number", false),
          col("estimate_date", "Estimate Date", "date"),
          col("client_name", "Client"),
          col("estimated_cents", "Estimated Value", "money"),
          col("invoiced_cents", "Invoiced Value", "money"),
          col("paid_cents", "Paid", "money"),
          col("variance_cents", "Variance", "money"),
        ],
        rows,
        [
          "Invoiced and paid values are summed across all non-void invoices linked to each won or invoiced estimate.",
        ]
      );
    },
  },
];
