import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  AR_WRITE_OFF_METHOD,
  ISSUED_INVOICE_STATUSES,
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
  issuedInvoiceFilter,
  MONTH_KEYS,
  MONTH_LABELS,
  netPaymentCents,
  resolveDateRange,
} from "@/lib/reports/helpers";

// ============================================================
// Revenue section — pre-built reports.
// ============================================================

type PaymentBucket =
  | "cash"
  | "check"
  | "credit_card"
  | "ach"
  | "autopay"
  | "other";

function paymentBucket(method: string | null): PaymentBucket {
  if (!method) return "other";
  if (method === "Cash") return "cash";
  if (method === "Check") return "check";
  if (method.startsWith("Credit Card")) return "credit_card";
  if (method === "ACH/E-Check") return "ach";
  if (method === "AutoPay") return "autopay";
  return "other";
}

export const REVENUE_REPORTS: PrebuiltReportDef[] = [
  {
    key: "invoice-audit-summary",
    section: "revenue",
    name: "Invoice Audit Summary",
    description:
      "Shows every invoice line item in the period — what was billed, to whom, and for how much.",
    filters: [dateRangeFilterDef("Invoice Date", "this_month")],
    notes: ["Excludes line items on draft and void invoices."],
    analysis: (params) => ({
      dataset: "rpt_invoice_line_items",
      columns: [
        "client_name",
        "invoice_number",
        "invoice_date",
        "name",
        "description",
        "qty",
        "rate_cents",
        "total_cents",
        "invoice_status",
      ],
      filters: [
        ...issuedInvoiceFilter(),
        ...dateRangeFilters("invoice_date", params),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "invoice_date",
      sortDir: "desc",
    }),
  },
  {
    key: "payment-audit-summary",
    section: "revenue",
    name: "Payment Audit Summary",
    description:
      "Shows payments received per day, broken out by payment method.",
    filters: [dateRangeFilterDef("Payment Date", "this_month")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");
      let query = supabase
        .from("crm_payments")
        .select("payment_date, method, amount_cents, refunded_amount_cents, unused_amount_cents")
        .is("deleted_at", null)
        .eq("is_credit", false)
        .neq("method", AR_WRITE_OFF_METHOD);
      if (from) query = query.gte("payment_date", from);
      if (to) query = query.lte("payment_date", to);
      const { data, error } = await query.limit(5000);
      if (error) throw new Error(error.message);

      type Row = {
        payment_date: string | null;
        method: string | null;
        amount_cents: number | null;
        refunded_amount_cents: number | null;
        unused_amount_cents: number | null;
      };

      interface DayTotals {
        cash: number;
        check: number;
        credit_card: number;
        autopay: number;
        ach: number;
        other: number;
        unused_cents: number;
        total_cents: number;
      }
      const byDate = new Map<string, DayTotals>();
      for (const r of (data ?? []) as unknown as Row[]) {
        const date = r.payment_date ?? "(no date)";
        const totals =
          byDate.get(date) ?? {
            cash: 0,
            check: 0,
            credit_card: 0,
            autopay: 0,
            ach: 0,
            other: 0,
            unused_cents: 0,
            total_cents: 0,
          };
        const amount = netPaymentCents(r);
        totals[paymentBucket(r.method)] += amount;
        totals.unused_cents += r.unused_amount_cents ?? 0;
        totals.total_cents += amount;
        byDate.set(date, totals);
      }

      const rows = [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, totals]) => ({ date, ...totals }));

      return buildResult(
        [
          col("date", "Date", "date"),
          col("cash", "Cash", "money"),
          col("check", "Check", "money"),
          col("credit_card", "Credit Card", "money"),
          col("ach", "ACH/E-Check", "money"),
          col("autopay", "AutoPay", "money"),
          col("other", "Other", "money"),
          col("unused_cents", "Unapplied", "money"),
          col("total_cents", "Total", "money"),
        ],
        rows,
        ["Cash only: excludes account credits and AR write-offs; amounts are net of refunds."]
      );
    },
  },
  {
    key: "credit-card-processing-fees",
    section: "revenue",
    name: "Credit Card Processing Fees",
    description:
      "Processing fees collected from clients on card payments — this is company revenue, tracked separately from the invoice amount it was collected alongside.",
    filters: [dateRangeFilterDef("Payment Date", "this_month")],
    notes: [
      "Only card payments carry a fee — ACH payments are always fee-free by design.",
      "A fee of $0 on a card payment means the fee was waived or the balance was under the settings threshold.",
    ],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");
      let query = supabase
        .from("crm_payments")
        .select(
          "payment_date, method, amount_cents, refunded_amount_cents, processing_fee_cents, clients:client_id(display_name)"
        )
        .is("deleted_at", null)
        .gt("processing_fee_cents", 0)
        .eq("is_credit", false)
        .neq("method", AR_WRITE_OFF_METHOD);
      if (from) query = query.gte("payment_date", from);
      if (to) query = query.lte("payment_date", to);
      const { data, error } = await query.order("payment_date", { ascending: false }).limit(5000);
      if (error) throw new Error(error.message);

      type Row = {
        payment_date: string | null;
        method: string | null;
        amount_cents: number | null;
        refunded_amount_cents: number | null;
        processing_fee_cents: number | null;
        clients: { display_name: string | null } | null;
      };
      const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
        payment_date: r.payment_date,
        client_name: r.clients?.display_name ?? "(unknown)",
        method: r.method,
        amount_cents: netPaymentCents(r),
        processing_fee_cents: r.processing_fee_cents ?? 0,
      }));

      const totalFeeCents = rows.reduce((sum, r) => sum + r.processing_fee_cents, 0);

      return buildResult(
        [
          col("payment_date", "Payment Date", "date"),
          col("client_name", "Client"),
          col("method", "Method"),
          col("amount_cents", "Payment Amount", "money"),
          col("processing_fee_cents", "Processing Fee", "money"),
        ],
        rows,
        [
          `Total processing fees collected in this period: $${(totalFeeCents / 100).toFixed(2)}`,
          "Cash only: excludes account credits and AR write-offs; Payment Amount is net of refunds.",
        ]
      );
    },
  },
  {
    key: "revenue-by-postal-code",
    section: "revenue",
    name: "Revenue by Postal Code",
    description: "Totals invoiced revenue by billing postal code.",
    filters: [dateRangeFilterDef("Invoice Date", "this_year")],
    notes: ["Excludes draft and void invoices."],
    analysis: (params) => ({
      dataset: "rpt_invoices",
      columns: [],
      filters: [
        ...issuedInvoiceFilter(),
        ...dateRangeFilters("invoice_date", params, { preset: "this_year" }),
      ],
      groupBy: ["billing_zip"],
      aggregates: [
        { column: "total_cents", fn: "sum" },
        { column: "subtotal_cents", fn: "sum" },
        { column: "*", fn: "count" },
      ],
      sortColumn: "sum_total_cents",
      sortDir: "desc",
    }),
  },
  {
    key: "revenue-by-service-summary",
    section: "revenue",
    name: "Revenue by Service Summary",
    description:
      "Shows invoiced revenue per service line item, broken out by month.",
    filters: [dateRangeFilterDef("Invoice Date", "this_year")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      // Rule A (issued invoices only) and the soft-delete guard are applied on
      // the joined parent; `!inner` drops line items whose invoice fails them.
      let query = supabase
        .from("crm_invoice_line_items")
        .select("name, total_cents, crm_invoices:invoice_id!inner(invoice_date, status)")
        .is("crm_invoices.deleted_at", null)
        .in("crm_invoices.status", ISSUED_INVOICE_STATUSES);
      if (from) query = query.gte("crm_invoices.invoice_date", from);
      if (to) query = query.lte("crm_invoices.invoice_date", to);
      const { data, error } = await query.limit(5000);
      if (error) throw new Error(error.message);

      type Row = {
        name: string | null;
        total_cents: number | null;
        crm_invoices: { invoice_date: string | null; status: string | null } | null;
      };
      const lines = (data ?? []) as unknown as Row[];

      interface ServiceTotals {
        months: number[];
        total_cents: number;
      }
      const byService = new Map<string, ServiceTotals>();
      for (const line of lines) {
        const name = line.name || "(unnamed)";
        const totals =
          byService.get(name) ?? { months: new Array<number>(12).fill(0), total_cents: 0 };
        const amount = line.total_cents ?? 0;
        const monthIndex =
          parseInt((line.crm_invoices?.invoice_date ?? "").slice(5, 7), 10) - 1;
        if (monthIndex >= 0 && monthIndex < 12) totals.months[monthIndex] += amount;
        totals.total_cents += amount;
        byService.set(name, totals);
      }

      const rows = [...byService.entries()]
        .sort((a, b) => b[1].total_cents - a[1].total_cents)
        .map(([name, totals]) => {
          const monthCols: Record<string, number> = {};
          MONTH_KEYS.forEach((key, i) => {
            monthCols[key] = totals.months[i];
          });
          return { name, ...monthCols, total_cents: totals.total_cents };
        });

      return buildResult(
        [
          col("name", "Service"),
          ...MONTH_KEYS.map((m, i) => col(m, MONTH_LABELS[i], "money")),
          col("total_cents", "Total", "money"),
        ],
        rows,
        ["Revenue is reported on the invoice date. Draft and void invoices are excluded."]
      );
    },
  },
  {
    key: "daily-production",
    section: "revenue",
    name: "Daily Production",
    description:
      "Shows completed visits with budgeted vs actual hours, man-hours, and revenue.",
    filters: [
      dateRangeFilterDef("Completed Between", "this_month"),
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
    ],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "scheduled_date",
        "completed_at",
        "client_name",
        "service_names",
        "crew_name",
        "men_count",
        "budgeted_hours",
        "actual_hours",
        "man_hours",
        "variance_hours",
        "revenue_cents",
        "sales_rep",
      ],
      filters: [
        ...dateRangeFilters("completed_at", params, { datetime: true }),
        { column: "status", op: "eq", value: "completed" },
        ...eqFilter("crew_name", params.crew),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "completed_at",
      sortDir: "desc",
    }),
  },
  {
    key: "sales-activity-summary",
    section: "revenue",
    name: "Sales Activity Summary",
    description:
      "Totals completed-visit revenue and man-hours by sales rep.",
    filters: [dateRangeFilterDef("Completed Between", "this_month")],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [],
      filters: [
        { column: "status", op: "eq", value: "completed" },
        ...dateRangeFilters("completed_at", params, { datetime: true }),
      ],
      groupBy: ["sales_rep"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "revenue_cents", fn: "sum" },
        { column: "man_hours", fn: "sum" },
      ],
      sortColumn: "sum_revenue_cents",
      sortDir: "desc",
    }),
  },
  {
    key: "approved-sales-by-sales-rep",
    section: "revenue",
    name: "Approved Sales by Sales Rep",
    description:
      "Totals sold jobs per sales rep — job count, service, product, and job totals.",
    filters: [dateRangeFilterDef("Date Sold", "this_month")],
    notes: ["Based on the job's Date Sold."],
    analysis: (params) => ({
      dataset: "rpt_jobs",
      columns: [],
      filters: [...dateRangeFilters("date_sold", params)],
      groupBy: ["sales_rep"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "total_cents", fn: "sum" },
        { column: "service_total_cents", fn: "sum" },
        { column: "product_total_cents", fn: "sum" },
      ],
      sortColumn: "sum_total_cents",
      sortDir: "desc",
    }),
  },
  {
    key: "sales-by-date-sold",
    section: "revenue",
    name: "Sales by Date Sold (Detail)",
    description:
      "Shows each job sold in the period with its services, sales rep, source, and total.",
    filters: [
      dateRangeFilterDef("Date Sold", "this_month"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_jobs",
      columns: [
        "date_sold",
        "job_number",
        "client_name",
        "service_names",
        "job_type",
        "sales_rep",
        "source",
        "total_cents",
      ],
      filters: [
        ...dateRangeFilters("date_sold", params),
        ...eqFilter("sales_rep", params.sales_rep),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "date_sold",
      sortDir: "desc",
    }),
  },
  {
    key: "invoices-and-payments",
    section: "revenue",
    name: "Invoices and Payments",
    description: "Compares invoiced revenue to payments collected, month by month.",
    filters: [dateRangeFilterDef("Date Range", "this_year")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");

      let invQuery = supabase
        .from("crm_invoices")
        .select("invoice_date, total_cents, status")
        .is("deleted_at", null)
        .in("status", ISSUED_INVOICE_STATUSES);
      if (from) invQuery = invQuery.gte("invoice_date", from);
      if (to) invQuery = invQuery.lte("invoice_date", to);
      const { data: invData, error: invError } = await invQuery.limit(5000);
      if (invError) throw new Error(invError.message);

      let payQuery = supabase
        .from("crm_payments")
        .select("payment_date, amount_cents, refunded_amount_cents")
        .is("deleted_at", null)
        .eq("is_credit", false)
        .neq("method", AR_WRITE_OFF_METHOD);
      if (from) payQuery = payQuery.gte("payment_date", from);
      if (to) payQuery = payQuery.lte("payment_date", to);
      const { data: payData, error: payError } = await payQuery.limit(5000);
      if (payError) throw new Error(payError.message);

      type InvoiceRow = { invoice_date: string | null; total_cents: number | null };
      type PaymentRow = {
        payment_date: string | null;
        amount_cents: number | null;
        refunded_amount_cents: number | null;
      };

      const invoicedMonths = new Array<number>(12).fill(0);
      for (const r of (invData ?? []) as unknown as InvoiceRow[]) {
        const idx = parseInt((r.invoice_date ?? "").slice(5, 7), 10) - 1;
        if (idx >= 0 && idx < 12) invoicedMonths[idx] += r.total_cents ?? 0;
      }
      const collectedMonths = new Array<number>(12).fill(0);
      for (const r of (payData ?? []) as unknown as PaymentRow[]) {
        const idx = parseInt((r.payment_date ?? "").slice(5, 7), 10) - 1;
        if (idx >= 0 && idx < 12) collectedMonths[idx] += netPaymentCents(r);
      }

      const rows = [
        {
          metric: "Invoiced",
          ...Object.fromEntries(MONTH_KEYS.map((k, i) => [k, invoicedMonths[i]])),
          total_cents: invoicedMonths.reduce((a, b) => a + b, 0),
        },
        {
          metric: "Collected",
          ...Object.fromEntries(MONTH_KEYS.map((k, i) => [k, collectedMonths[i]])),
          total_cents: collectedMonths.reduce((a, b) => a + b, 0),
        },
      ];

      return buildResult(
        [
          col("metric", "Metric"),
          ...MONTH_KEYS.map((m, i) => col(m, MONTH_LABELS[i], "money")),
          col("total_cents", "Total", "money"),
        ],
        rows,
        [
          "Invoiced reflects the invoice date and excludes draft and void invoices. Collected reflects the payment date and is cash only — excludes account credits and AR write-offs; net of refunds.",
        ]
      );
    },
  },
  {
    key: "credit-card-charges",
    section: "revenue",
    name: "Credit Card Charges",
    description: "Shows credit card payments received, including processing fees where applicable.",
    filters: [dateRangeFilterDef("Payment Date", "this_month")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");
      let query = supabase
        .from("crm_payments")
        .select(
          "payment_date, method, reference, amount_cents, refunded_amount_cents, processing_fee_cents, clients:client_id(display_name)"
        )
        .is("deleted_at", null)
        .like("method", "Credit Card%")
        .eq("is_credit", false)
        .neq("method", AR_WRITE_OFF_METHOD);
      if (from) query = query.gte("payment_date", from);
      if (to) query = query.lte("payment_date", to);
      const { data, error } = await query.order("payment_date", { ascending: false }).limit(5000);
      if (error) throw new Error(error.message);

      type Row = {
        payment_date: string | null;
        method: string | null;
        reference: string | null;
        amount_cents: number | null;
        refunded_amount_cents: number | null;
        processing_fee_cents: number | null;
        clients: { display_name: string | null } | null;
      };

      const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
        payment_date: r.payment_date,
        client_name: r.clients?.display_name ?? "(unknown)",
        method: r.method,
        reference: r.reference,
        amount_cents: netPaymentCents(r),
        processing_fee_cents: r.processing_fee_cents ?? 0,
      }));

      return buildResult(
        [
          col("payment_date", "Date"),
          col("client_name", "Client"),
          col("method", "Card Type"),
          col("reference", "Reference"),
          col("amount_cents", "Amount", "money"),
          col("processing_fee_cents", "Processing Fee", "money"),
        ],
        rows,
        ["Cash only: excludes account credits and AR write-offs; Amount is net of refunds."]
      );
    },
  },
];
