import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
  resolveDateRange,
} from "@/lib/reports/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================
// Financial section — pre-built reports.
// ============================================================

/** Sum job-material costs (by created_at) and field-labor costs (by completed_at) in a window. */
async function sumExpenses(
  supabase: SupabaseClient,
  from: string | null,
  to: string | null
): Promise<{ materialsCents: number; laborCents: number }> {
  let matQuery = supabase
    .from("crm_job_materials")
    .select("total_cost_cents")
    .is("deleted_at", null);
  if (from) matQuery = matQuery.gte("created_at", from);
  if (to) matQuery = matQuery.lte("created_at", `${to} 23:59:59.999`);
  const { data: matData, error: matError } = await matQuery.limit(5000);
  if (matError) throw new Error(matError.message);

  let laborQuery = supabase
    .from("crm_job_visits")
    .select("actual_labor_cost_cents")
    .is("deleted_at", null);
  if (from) laborQuery = laborQuery.gte("completed_at", from);
  if (to) laborQuery = laborQuery.lte("completed_at", `${to} 23:59:59.999`);
  const { data: laborData, error: laborError } = await laborQuery.limit(5000);
  if (laborError) throw new Error(laborError.message);

  type MatRow = { total_cost_cents: number | null };
  type LaborRow = { actual_labor_cost_cents: number | null };
  const materialsCents = ((matData ?? []) as unknown as MatRow[]).reduce(
    (sum, r) => sum + (r.total_cost_cents ?? 0),
    0
  );
  const laborCents = ((laborData ?? []) as unknown as LaborRow[]).reduce(
    (sum, r) => sum + (r.actual_labor_cost_cents ?? 0),
    0
  );
  return { materialsCents, laborCents };
}

const PROFIT_LOSS_COLUMNS = [
  col("type", "Type"),
  col("name", "Category"),
  col("amount_cents", "Amount", "money", false),
];

export const FINANCIAL_REPORTS: PrebuiltReportDef[] = [
  {
    key: "invoiced-income-by-client",
    section: "financial",
    name: "Invoiced Income by Client",
    description:
      "Totals invoiced income per client — subtotal, tax, total, and amount paid.",
    filters: [dateRangeFilterDef("Invoice Date", "this_year")],
    analysis: (params) => ({
      dataset: "rpt_invoices",
      columns: [],
      filters: [
        { column: "status", op: "neq", value: "void" },
        ...dateRangeFilters("invoice_date", params, { preset: "this_year" }),
      ],
      groupBy: ["client_name"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "subtotal_cents", fn: "sum" },
        { column: "tax_cents", fn: "sum" },
        { column: "total_cents", fn: "sum" },
        { column: "amount_paid_cents", fn: "sum" },
      ],
      sortColumn: "sum_total_cents",
      sortDir: "desc",
    }),
  },
  {
    key: "invoices-with-balances",
    section: "financial",
    name: "Invoices with Balances",
    description:
      "Shows every open invoice with a balance due and how many days overdue it is.",
    filters: [dateRangeFilterDef("Invoice Date", "all_time")],
    analysis: (params) => ({
      dataset: "rpt_invoices",
      columns: [
        "invoice_number",
        "invoice_date",
        "due_date",
        "client_name",
        "total_cents",
        "amount_paid_cents",
        "balance_cents",
        "status",
        "days_overdue",
      ],
      filters: [
        { column: "balance_cents", op: "gt", value: 0 },
        { column: "status", op: "neq", value: "void" },
        ...dateRangeFilters("invoice_date", params, { preset: "all_time" }),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "days_overdue",
      sortDir: "desc",
    }),
  },
  {
    key: "pre-payments",
    section: "financial",
    name: "Pre-Payments",
    description: "Shows prepayments received, how much has been applied, and what remains.",
    filters: [dateRangeFilterDef("Payment Date", "this_year")],
    analysis: (params) => ({
      dataset: "rpt_payments",
      columns: [
        "payment_date",
        "client_name",
        "method",
        "amount_cents",
        "applied_amount_cents",
        "unused_amount_cents",
      ],
      filters: [
        { column: "is_prepayment", op: "eq", value: true },
        ...dateRangeFilters("payment_date", params, { preset: "this_year" }),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "payment_date",
      sortDir: "desc",
    }),
  },
  {
    key: "profit-loss-accrual",
    section: "financial",
    name: "Profit / Loss — Accrual Basis",
    description:
      "Income by invoiced line item (accrual basis) less job material and field labor costs.",
    filters: [dateRangeFilterDef("Date Range", "this_month")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");

      let lineQuery = supabase
        .from("crm_invoice_line_items")
        .select("name, description, total_cents, crm_invoices:invoice_id!inner(invoice_date, status)");
      if (from) lineQuery = lineQuery.gte("crm_invoices.invoice_date", from);
      if (to) lineQuery = lineQuery.lte("crm_invoices.invoice_date", to);
      const { data, error } = await lineQuery.limit(5000);
      if (error) throw new Error(error.message);

      type LineRow = {
        name: string | null;
        description: string | null;
        total_cents: number | null;
        crm_invoices: { invoice_date: string | null; status: string | null } | null;
      };
      const lines = ((data ?? []) as unknown as LineRow[]).filter((r) => {
        const status = r.crm_invoices?.status ?? "";
        return status !== "void" && status !== "draft";
      });

      const incomeByName = new Map<string, number>();
      for (const line of lines) {
        const name = line.name || line.description || "(unnamed)";
        incomeByName.set(name, (incomeByName.get(name) ?? 0) + (line.total_cents ?? 0));
      }
      const incomeRows = [...incomeByName.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, amount]) => ({ type: "Income", name, amount_cents: amount }));
      const totalIncome = incomeRows.reduce((sum, r) => sum + r.amount_cents, 0);

      const { materialsCents, laborCents } = await sumExpenses(supabase, from, to);
      const totalExpenses = materialsCents + laborCents;

      const rows = [
        ...incomeRows,
        { type: "Expenses", name: "Job materials", amount_cents: materialsCents },
        { type: "Expenses", name: "Field labor", amount_cents: laborCents },
        { type: "Total", name: "Total Profit", amount_cents: totalIncome - totalExpenses },
      ];

      return buildResult(PROFIT_LOSS_COLUMNS, rows, [
        "Accrual basis: income is counted on the invoice date regardless of when payment is received. Draft and void invoices are excluded.",
        "Expenses include job material costs (by purchase date) and field labor costs (by visit completion). Overhead and non-job expenses are not included.",
      ]);
    },
  },
  {
    key: "profit-loss-cash",
    section: "financial",
    name: "Profit / Loss — Cash Basis",
    description:
      "Income by payments received (cash basis) less job material and field labor costs.",
    filters: [dateRangeFilterDef("Date Range", "this_month")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");

      let payQuery = supabase
        .from("crm_payments")
        .select("amount_cents, unused_amount_cents")
        .is("deleted_at", null);
      if (from) payQuery = payQuery.gte("payment_date", from);
      if (to) payQuery = payQuery.lte("payment_date", to);
      const { data, error } = await payQuery.limit(5000);
      if (error) throw new Error(error.message);

      type PayRow = { amount_cents: number | null; unused_amount_cents: number | null };
      let appliedCents = 0;
      let unappliedCents = 0;
      for (const p of (data ?? []) as unknown as PayRow[]) {
        const amount = p.amount_cents ?? 0;
        const unused = p.unused_amount_cents ?? 0;
        appliedCents += amount - unused;
        unappliedCents += unused;
      }
      const totalIncome = appliedCents + unappliedCents;

      const { materialsCents, laborCents } = await sumExpenses(supabase, from, to);
      const totalExpenses = materialsCents + laborCents;

      const rows = [
        { type: "Income", name: "Payments applied", amount_cents: appliedCents },
        { type: "Income", name: "Unapplied / prepayments", amount_cents: unappliedCents },
        { type: "Expenses", name: "Job materials", amount_cents: materialsCents },
        { type: "Expenses", name: "Field labor", amount_cents: laborCents },
        { type: "Total", name: "Total Profit", amount_cents: totalIncome - totalExpenses },
      ];

      return buildResult(PROFIT_LOSS_COLUMNS, rows, [
        "Cash basis: income is counted when payment is received, not when work is invoiced.",
        "Expenses include job material costs (by purchase date) and field labor costs (by visit completion). Overhead and non-job expenses are not included.",
      ]);
    },
  },
  {
    key: "sales-tax",
    section: "financial",
    name: "Sales Tax Report",
    description:
      "Shows taxable, non-taxable, and collected sales tax totals by month.",
    filters: [dateRangeFilterDef("Invoice Date", "this_year")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      let query = supabase
        .from("crm_invoices")
        .select("invoice_date, subtotal_cents, tax_cents, total_cents")
        .neq("status", "void")
        .is("deleted_at", null);
      if (from) query = query.gte("invoice_date", from);
      if (to) query = query.lte("invoice_date", to);
      const { data, error } = await query.limit(5000);
      if (error) throw new Error(error.message);

      type Row = {
        invoice_date: string | null;
        subtotal_cents: number | null;
        tax_cents: number | null;
        total_cents: number | null;
      };
      const byMonth = new Map<
        string,
        { total: number; taxable: number; nonTaxable: number; tax: number }
      >();
      for (const r of (data ?? []) as unknown as Row[]) {
        const month = (r.invoice_date ?? "").slice(0, 7) || "(no date)";
        const bucket =
          byMonth.get(month) ?? { total: 0, taxable: 0, nonTaxable: 0, tax: 0 };
        const subtotal = r.subtotal_cents ?? 0;
        const tax = r.tax_cents ?? 0;
        bucket.total += r.total_cents ?? 0;
        if (tax > 0) bucket.taxable += subtotal;
        else bucket.nonTaxable += subtotal;
        bucket.tax += tax;
        byMonth.set(month, bucket);
      }

      const rows = [...byMonth.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, b]) => ({
          month,
          total_sales_cents: b.total,
          taxable_sales_cents: b.taxable,
          non_taxable_sales_cents: b.nonTaxable,
          tax_collected_cents: b.tax,
        }));

      return buildResult(
        [
          col("month", "Month"),
          col("total_sales_cents", "Total Sales", "money"),
          col("taxable_sales_cents", "Taxable Sales", "money"),
          col("non_taxable_sales_cents", "Non-Taxable Sales", "money"),
          col("tax_collected_cents", "Tax Collected", "money"),
        ],
        rows,
        ["Tax is reported on invoice date (accrual)."]
      );
    },
  },
];
