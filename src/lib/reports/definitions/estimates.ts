import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  ISSUED_INVOICE_STATUSES,
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
  resolveDateRange,
} from "@/lib/reports/helpers";
import { isoNy, shiftYmd } from "@/lib/reports/ny-date";
import type { AnalysisFilter } from "@/types/crm-reports";

// ============================================================
// Estimates section — pre-built reports.
// ============================================================

/**
 * Line-item status filter: a client accepting an estimate can decline
 * optional lines, which are marked 'lost' (header totals already exclude
 * them). Won-estimate line reports must drop those too.
 */
const EXCLUDE_LOST_LINES: AnalysisFilter = { column: "status", op: "neq", value: "lost" };
const EXCLUDE_LOST_LINES_NOTE = "Excludes declined line items (line status = lost).";

const STAGE_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "quote", label: "Quote" },
  { value: "sent", label: "Sent" },
  { value: "accepted", label: "Accepted" },
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
        "description",
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
    name: "Accepted Estimates by Service",
    description:
      "Shows every service line on accepted and invoiced estimates with hours, cost, and value.",
    filters: [
      dateRangeFilterDef("Estimate Date", "this_year"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    notes: [EXCLUDE_LOST_LINES_NOTE],
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
        { column: "estimate_stage", op: "in", value: ["accepted", "invoiced"] },
        EXCLUDE_LOST_LINES,
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
    name: "Accepted Estimates by Service (Summary)",
    description:
      "Totals accepted and invoiced estimate lines by service — line count, value, hours, and cost.",
    filters: [
      dateRangeFilterDef("Estimate Date", "this_year"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    notes: [EXCLUDE_LOST_LINES_NOTE],
    analysis: (params) => ({
      dataset: "rpt_estimate_line_items",
      columns: [],
      filters: [
        { column: "estimate_stage", op: "in", value: ["accepted", "invoiced"] },
        EXCLUDE_LOST_LINES,
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
    name: "Accepted Estimates — Estimated vs Invoiced Value",
    description:
      "Compares each accepted estimate's value against what was actually invoiced and paid.",
    filters: [dateRangeFilterDef("Estimate Date", "this_year")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      let query = supabase
        .from("estimates")
        .select("id, estimate_number, estimate_date, total_cents, clients:client_id(display_name)")
        .in("stage", ["accepted", "invoiced"])
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
          .is("deleted_at", null)
          .in("status", ISSUED_INVOICE_STATUSES)
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
          "Invoiced and paid values are summed across all non-void invoices linked to each accepted or invoiced estimate.",
        ]
      );
    },
  },
  {
    key: "close-ratios-by-sales-rep",
    section: "estimates",
    name: "Close Ratios by Sales Rep",
    description: "Shows each sales rep's win rate by estimate count and by dollar value for a date range.",
    filters: [dateRangeFilterDef("Estimate Date", "this_month")],
    notes: [
      "Won = accepted or invoiced. Draft estimates were never presented to a client and are excluded from both counts and amounts.",
    ],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");
      let query = supabase
        .from("estimates")
        .select("stage, total_cents, sales_rep:crm_employees!estimates_sales_rep_id_fkey(first_name,last_name)")
        .neq("stage", "draft")
        .is("deleted_at", null);
      if (from) query = query.gte("estimate_date", from);
      if (to) query = query.lte("estimate_date", to);
      const { data, error } = await query.limit(10000);
      if (error) throw new Error(error.message);

      type Row = {
        stage: string | null;
        total_cents: number | null;
        sales_rep: { first_name: string | null; last_name: string | null } | null;
      };

      interface RepTotals {
        won_count: number;
        total_count: number;
        won_cents: number;
        total_cents: number;
      }
      const byRep = new Map<string, RepTotals>();
      for (const r of (data ?? []) as unknown as Row[]) {
        const name = `${r.sales_rep?.first_name ?? ""} ${r.sales_rep?.last_name ?? ""}`.trim() || "(unassigned)";
        const totals = byRep.get(name) ?? { won_count: 0, total_count: 0, won_cents: 0, total_cents: 0 };
        const isWon = r.stage === "accepted" || r.stage === "invoiced";
        totals.total_count += 1;
        totals.total_cents += r.total_cents ?? 0;
        if (isWon) {
          totals.won_count += 1;
          totals.won_cents += r.total_cents ?? 0;
        }
        byRep.set(name, totals);
      }

      const rows = [...byRep.entries()]
        .map(([sales_rep, t]) => ({
          sales_rep,
          won_count: t.won_count,
          total_count: t.total_count,
          won_count_pct: t.total_count > 0 ? Math.round((t.won_count / t.total_count) * 1000) / 10 : 0,
          won_cents: t.won_cents,
          total_est_cents: t.total_cents,
          won_amount_pct: t.total_cents > 0 ? Math.round((t.won_cents / t.total_cents) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.total_count - a.total_count);

      return buildResult(
        [
          col("sales_rep", "Sales Rep"),
          col("won_count", "Won Count", "number", false),
          col("total_count", "Total Count", "number", false),
          col("won_count_pct", "Won Count Ratio", "percent"),
          col("won_cents", "Won Amount", "money"),
          col("total_est_cents", "Total Estimated", "money"),
          col("won_amount_pct", "Won Amount Ratio", "percent"),
        ],
        rows
      );
    },
  },
  {
    key: "sales-activity-last-7-days",
    section: "estimates",
    name: "Sales Activity (Last 7 Days)",
    description: "Shows estimates created or sent per day over the last 7 days.",
    filters: [],
    run: async ({ supabase }) => {
      // estimate_date is a plain date entered on the org's (NY) calendar, so
      // the 7-day window is anchored to today's NY date, not the server's UTC day.
      const todayNy = isoNy(new Date());
      const startIso = shiftYmd(todayNy, -6);

      const { data, error } = await supabase
        .from("estimates")
        .select("estimate_date")
        .is("deleted_at", null)
        .gte("estimate_date", startIso)
        .limit(10000);
      if (error) throw new Error(error.message);

      const counts = new Map<string, number>();
      for (const r of (data ?? []) as { estimate_date: string | null }[]) {
        if (!r.estimate_date) continue;
        const day = r.estimate_date.slice(0, 10);
        counts.set(day, (counts.get(day) ?? 0) + 1);
      }

      const days: { day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const key = shiftYmd(todayNy, -i);
        days.push({ day: key, count: counts.get(key) ?? 0 });
      }

      return buildResult(
        [col("day", "Date", "date"), col("count", "# of Estimates", "number", false)],
        days
      );
    },
  },
];
