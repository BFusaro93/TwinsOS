import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  containsFilter,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
  ISSUED_INVOICE_STATUSES,
  resolveDateRange,
} from "@/lib/reports/helpers";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";

// ============================================================
// Audits section — pre-built reports.
// ============================================================

const ACTIVITY_TYPE_OPTIONS = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "invoice", label: "Invoice" },
  { value: "payment", label: "Payment" },
  { value: "job_visit", label: "Job Visit" },
  { value: "estimate", label: "Estimate" },
  { value: "contract", label: "Contract" },
  { value: "automation", label: "Automation" },
];

export const AUDIT_REPORTS: PrebuiltReportDef[] = [
  {
    key: "client-timeline",
    section: "audits",
    name: "Client Timeline Report",
    description:
      "Shows every activity on client accounts — notes, calls, emails, invoices, payments, and visits.",
    filters: [
      dateRangeFilterDef(),
      { key: "type", label: "Activity Type", type: "select", options: ACTIVITY_TYPE_OPTIONS },
      { key: "client", label: "Client Name", type: "text", placeholder: "Any client" },
    ],
    analysis: (params) => ({
      dataset: "rpt_client_activity",
      columns: [
        "occurred_at",
        "activity_type",
        "client_name",
        "subject",
        "amount_cents",
        "status",
      ],
      filters: [
        ...dateRangeFilters("occurred_at", params, { datetime: true }),
        ...eqFilter("activity_type", params.type),
        ...containsFilter("client_name", params.client),
        { column: "client_status", op: "neq", value: "lead" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "occurred_at",
      sortDir: "desc",
    }),
  },
  {
    key: "lead-timeline",
    section: "audits",
    name: "Lead Timeline Report",
    description:
      "Shows every activity on lead accounts — notes, calls, emails, and estimates.",
    filters: [
      dateRangeFilterDef(),
      { key: "type", label: "Activity Type", type: "select", options: ACTIVITY_TYPE_OPTIONS },
      { key: "client", label: "Lead Name", type: "text", placeholder: "Any lead" },
    ],
    analysis: (params) => ({
      dataset: "rpt_client_activity",
      columns: [
        "occurred_at",
        "activity_type",
        "client_name",
        "subject",
        "amount_cents",
        "status",
      ],
      filters: [
        ...dateRangeFilters("occurred_at", params, { datetime: true }),
        ...eqFilter("activity_type", params.type),
        ...containsFilter("client_name", params.client),
        { column: "client_status", op: "eq", value: "lead" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "occurred_at",
      sortDir: "desc",
    }),
  },
  {
    key: "income-not-invoiced",
    section: "audits",
    name: "Income Not Invoiced",
    description:
      "Shows draft invoices — revenue already entered on a job but not yet finalized and sent to the client.",
    filters: [dateRangeFilterDef("Invoice Date", "this_month")],
    notes: [
      "Draft invoices only, by invoice date. A row drops off once the invoice is printed, sent, or voided. Completed visits that have not had an invoice created at all do not appear here.",
    ],
    analysis: (params) => ({
      dataset: "rpt_invoices",
      columns: [
        "invoice_number",
        "invoice_date",
        "client_name",
        "description",
        "service_address",
        "total_cents",
      ],
      filters: [
        ...dateRangeFilters("invoice_date", params),
        { column: "status", op: "eq", value: "draft" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "invoice_date",
      sortDir: "desc",
    }),
  },
  {
    key: "visits-client-balance-due",
    section: "audits",
    name: "Visits — Client Has Balance Due",
    description:
      "Shows completed and in-progress visits for clients who still have an outstanding balance.",
    filters: [dateRangeFilterDef("Visit Date", "this_month")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");

      type Row = {
        scheduled_date: string | null;
        completed_at: string | null;
        status: string | null;
        client_id: string | null;
        rate_cents: number | null;
        qty: number | null;
        crm_jobs: {
          client_id: string;
          service_address: string | null;
          service_city: string | null;
          rate_cents: number | null;
        } | null;
      };
      // crm_job_visits.client_id is nullable and is only a denormalized copy
      // of the job's client — resolve the client the same way the rpt_* views
      // do: COALESCE(visit.client_id, job.client_id). Inner-join the job so
      // visits of soft-deleted jobs drop out.
      const visits = await fetchAllRows<Row>(() => {
        let query = supabase
          .from("crm_job_visits")
          .select(
            "scheduled_date, completed_at, status, client_id, rate_cents, qty, crm_jobs!inner(client_id, service_address, service_city, rate_cents)"
          )
          .in("status", ["completed", "in_progress"])
          .is("deleted_at", null)
          .is("crm_jobs.deleted_at", null);
        if (from) query = query.gte("scheduled_date", from);
        if (to) query = query.lte("scheduled_date", to);
        return query.order("scheduled_date", { ascending: false });
      });

      const clientIdOf = (r: Row) => r.client_id ?? r.crm_jobs?.client_id ?? null;
      const clientIds = [...new Set(visits.map(clientIdOf).filter((id): id is string => !!id))];

      type ClientRow = {
        id: string;
        display_name: string | null;
        balance_outstanding_cents: number | null;
      };
      // Only clients that actually owe money, and only live (not deleted) ones.
      const clientsById = new Map<string, ClientRow>();
      for (let i = 0; i < clientIds.length; i += 200) {
        const chunk = clientIds.slice(i, i + 200);
        const clients = await fetchAllRows<ClientRow>(() =>
          supabase
            .from("clients")
            .select("id, display_name, balance_outstanding_cents")
            .in("id", chunk)
            .is("deleted_at", null)
            .gt("balance_outstanding_cents", 0)
        );
        for (const c of clients) clientsById.set(c.id, c);
      }

      const rows = visits.flatMap((r) => {
        const clientId = clientIdOf(r);
        const client = clientId ? clientsById.get(clientId) : undefined;
        if (!client) return [];
        return [
          {
            date: r.scheduled_date,
            client_name: client.display_name ?? "",
            status: r.status,
            address: r.crm_jobs?.service_address ?? "",
            city: r.crm_jobs?.service_city ?? "",
            amount_cents: Math.round(
              (r.rate_cents ?? r.crm_jobs?.rate_cents ?? 0) * (Number(r.qty) || 1)
            ),
            balance: client.balance_outstanding_cents ?? 0,
          },
        ];
      });

      return buildResult(
        [
          col("date", "Date", "date"),
          col("client_name", "Client"),
          col("status", "Status"),
          col("address", "Address"),
          col("city", "City"),
          col("amount_cents", "Amount", "money"),
          col("balance", "Account Balance", "money", false),
        ],
        rows,
        [
          "Completed and in-progress visits only (by scheduled date); amount is the visit rate × qty before tax.",
          "Account Balance is the client's current outstanding balance, repeated on each of their visits — it is not summed.",
        ]
      );
    },
  },
  {
    key: "unapplied-payments",
    section: "audits",
    name: "Unapplied Payments",
    description:
      "Shows payments with money still unapplied to an invoice, including prepayments and credits.",
    filters: [dateRangeFilterDef("Payment Date", "all_time")],
    analysis: (params) => ({
      dataset: "rpt_payments",
      columns: [
        "payment_date",
        "client_name",
        "method",
        "reference",
        "amount_cents",
        "unused_amount_cents",
      ],
      filters: [
        ...dateRangeFilters("payment_date", params, { preset: "all_time" }),
        { column: "unused_amount_cents", op: "gt", value: 0 },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "unused_amount_cents",
      sortDir: "desc",
    }),
  },
  {
    key: "sales-commission-export",
    section: "audits",
    name: "Sales Commission Export",
    description:
      "Shows finalized invoices by sales rep for commission calculations, excluding sales tax.",
    filters: [
      dateRangeFilterDef("Invoice Date", "this_month"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    notes: ["Rows appear once an invoice is finalized (not draft or void), regardless of payment status. Amounts exclude sales tax."],
    analysis: (params) => ({
      dataset: "rpt_invoices",
      columns: [
        "invoice_number",
        "invoice_date",
        "client_name",
        "sales_rep",
        "subtotal_cents",
        "amount_paid_cents",
        "under_contract",
      ],
      filters: [
        ...dateRangeFilters("invoice_date", params),
        ...eqFilter("sales_rep", params.sales_rep),
        { column: "status", op: "in", value: [...ISSUED_INVOICE_STATUSES] },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "invoice_date",
      sortDir: "desc",
    }),
  },
];
