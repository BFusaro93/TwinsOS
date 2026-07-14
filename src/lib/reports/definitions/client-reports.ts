import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  containsFilter,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
  MONTH_KEYS,
  MONTH_LABELS,
  resolveDateRange,
} from "@/lib/reports/helpers";

// ============================================================
// Client section — pre-built reports.
// ============================================================

export const CLIENT_REPORTS: PrebuiltReportDef[] = [
  {
    key: "client-balance",
    section: "client",
    name: "Client Balance",
    description: "Shows the clients that owe you and how much.",
    filters: [
      {
        key: "min_balance",
        label: "Where Balance Greater Than ($)",
        type: "number",
        defaultValue: "0",
      },
    ],
    analysis: (params) => ({
      dataset: "rpt_clients",
      columns: [
        "display_name",
        "billing_address",
        "billing_city",
        "billing_state",
        "billing_zip",
        "primary_phone",
        "sales_rep",
        "balance_outstanding_cents",
      ],
      filters: [
        {
          column: "balance_outstanding_cents",
          op: "gt",
          value: Math.round(parseFloat(params.min_balance || "0") * 100),
        },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "balance_outstanding_cents",
      sortDir: "desc",
    }),
  },
  {
    key: "client-contact-list",
    section: "client",
    name: "Client Contact List",
    description:
      "Shows a client contact list with the ability to sort by account balance and sales rep.",
    filters: [
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_client_contacts",
      columns: [
        "client_name",
        "first_name",
        "last_name",
        "contact_type",
        "phone",
        "email",
        "is_primary",
        "sales_rep",
        "balance_outstanding_cents",
      ],
      filters: [...eqFilter("sales_rep", params.sales_rep)],
      groupBy: [],
      aggregates: [],
      sortColumn: "client_name",
      sortDir: "asc",
    }),
  },
  {
    key: "client-phone-list",
    section: "client",
    name: "Client Phone List",
    description: "Shows clients and their phone numbers, filterable by sales rep.",
    filters: [
      dateRangeFilterDef("Client Since", "all_time"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_clients",
      columns: [
        "display_name",
        "primary_phone",
        "primary_email",
        "billing_city",
        "status",
        "sales_rep",
        "client_since",
      ],
      filters: [
        ...dateRangeFilters("client_since", params, { preset: "all_time" }),
        ...eqFilter("sales_rep", params.sales_rep),
        { column: "status", op: "neq", value: "lead" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "display_name",
      sortDir: "asc",
    }),
  },
  {
    key: "client-method-of-payment",
    section: "client",
    name: "Client Method of Payment",
    description: "Shows if a client typically pays by check or card.",
    filters: [
      {
        key: "status",
        label: "Client Type",
        type: "select",
        options: [
          { value: "active", label: "Active" },
          { value: "inactive", label: "Inactive" },
          { value: "cancelled", label: "Cancelled" },
        ],
      },
      {
        key: "payment_method",
        label: "Payment Method",
        type: "select",
        optionsSource: "paymentMethods",
      },
    ],
    analysis: (params) => ({
      dataset: "rpt_clients",
      columns: [
        "display_name",
        "status",
        "payment_method",
        "invoice_frequency",
        "billing_terms",
        "balance_outstanding_cents",
      ],
      filters: [
        ...eqFilter("status", params.status),
        ...eqFilter("payment_method", params.payment_method),
        { column: "status", op: "neq", value: "lead" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "display_name",
      sortDir: "asc",
    }),
  },
  {
    key: "client-referral",
    section: "client",
    name: "Client Referral",
    description: "Shows word-of-mouth referrals — who referred each client.",
    filters: [dateRangeFilterDef("Client Since", "this_year")],
    analysis: (params) => ({
      dataset: "rpt_clients",
      columns: [
        "display_name",
        "referred_by",
        "client_since",
        "status",
        "sales_rep",
        "billing_city",
      ],
      filters: [
        ...dateRangeFilters("client_since", params, { preset: "this_year" }),
        { column: "referred_by", op: "not_null" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "client_since",
      sortDir: "desc",
    }),
  },
  {
    key: "new-clients",
    section: "client",
    name: "New Clients Report",
    description: "Shows new clients in any defined time frame.",
    filters: [
      dateRangeFilterDef("Client Since", "this_month"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_clients",
      columns: [
        "display_name",
        "client_since",
        "source",
        "sales_rep",
        "status",
        "billing_city",
        "billing_zip",
        "primary_phone",
      ],
      filters: [
        ...dateRangeFilters("client_since", params),
        ...eqFilter("sales_rep", params.sales_rep),
        { column: "status", op: "neq", value: "lead" },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "client_since",
      sortDir: "desc",
    }),
  },
  {
    key: "terminations",
    section: "client",
    name: "Terminations Report",
    description: "Shows a list of clients who cancelled service, the date, and reason stated.",
    filters: [
      dateRangeFilterDef("Cancelled Between", "this_year"),
      { key: "reason", label: "Reason Contains", type: "text", placeholder: "Any reason" },
    ],
    analysis: (params) => ({
      dataset: "rpt_clients",
      columns: [
        "display_name",
        "closed_at",
        "cancellation_reason",
        "client_since",
        "sales_rep",
        "source",
        "balance_outstanding_cents",
      ],
      filters: [
        { column: "status", op: "eq", value: "cancelled" },
        ...dateRangeFilters("closed_at", params, { preset: "this_year", datetime: true }),
        ...containsFilter("cancellation_reason", params.reason),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "closed_at",
      sortDir: "desc",
    }),
  },
  {
    key: "cancellation-count",
    section: "client",
    name: "Cancellation Count Report",
    description: "Shows how many cancellations occurred, broken down by reason, source, and sales rep.",
    filters: [dateRangeFilterDef("Cancelled Between", "this_year")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      let query = supabase
        .from("clients")
        .select("cancellation_reason, source, billing_zip, closed_at, sales_rep_id, profiles:sales_rep_id(name)")
        .eq("status", "cancelled")
        .is("deleted_at", null);
      if (from) query = query.gte("closed_at", from);
      if (to) query = query.lte("closed_at", `${to} 23:59:59.999`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      type Row = {
        cancellation_reason: string | null;
        source: string | null;
        billing_zip: string | null;
        profiles: { name: string | null } | null;
      };
      const rows = (data ?? []) as unknown as Row[];
      const total = rows.length;

      const breakdown = (
        groupType: string,
        getKey: (r: Row) => string
      ) => {
        const counts = new Map<string, number>();
        for (const r of rows) {
          const k = getKey(r) || "(none)";
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([value, count]) => ({
            group_type: groupType,
            group_value: value,
            count,
            percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
          }));
      };

      const resultRows = [
        { group_type: "Total", group_value: "All Cancellations", count: total, percent: 100 },
        ...breakdown("By Reason", (r) => r.cancellation_reason ?? ""),
        ...breakdown("By Source", (r) => r.source ?? ""),
        ...breakdown("By Sales Rep", (r) => r.profiles?.name ?? ""),
        ...breakdown("By Postal Code", (r) => r.billing_zip ?? ""),
      ];

      return buildResult(
        [
          col("group_type", "Breakdown"),
          col("group_value", "Value"),
          col("count", "Count", "number", false),
          col("percent", "Percent", "percent"),
        ],
        resultRows
      );
    },
  },
  {
    key: "new-client-count",
    section: "client",
    name: "New Client Count Report",
    description: "Shows new clients grouped by postal code, source, and sales rep.",
    filters: [dateRangeFilterDef("Client Since", "this_year")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      let query = supabase
        .from("clients")
        .select("source, billing_zip, client_since, profiles:sales_rep_id(name)")
        .neq("status", "lead")
        .is("deleted_at", null);
      if (from) query = query.gte("client_since", from);
      if (to) query = query.lte("client_since", to);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      type Row = {
        source: string | null;
        billing_zip: string | null;
        profiles: { name: string | null } | null;
      };
      const rows = (data ?? []) as unknown as Row[];
      const total = rows.length;

      const breakdown = (groupType: string, getKey: (r: Row) => string) => {
        const counts = new Map<string, number>();
        for (const r of rows) {
          const k = getKey(r) || "(none)";
          counts.set(k, (counts.get(k) ?? 0) + 1);
        }
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([value, count]) => ({
            group_type: groupType,
            group_value: value,
            count,
            percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
          }));
      };

      const resultRows = [
        { group_type: "Total", group_value: "All New Clients", count: total, percent: 100 },
        ...breakdown("By Postal Code", (r) => r.billing_zip ?? ""),
        ...breakdown("By Source", (r) => r.source ?? ""),
        ...breakdown("By Sales Rep", (r) => r.profiles?.name ?? ""),
      ];

      return buildResult(
        [
          col("group_type", "Breakdown"),
          col("group_value", "Value"),
          col("count", "Count", "number", false),
          col("percent", "Percent", "percent"),
        ],
        resultRows
      );
    },
  },
  {
    key: "clients-by-completed-jobs",
    section: "client",
    name: "Clients Report by Completed Jobs",
    description: "Shows which clients were served in any defined time frame.",
    filters: [dateRangeFilterDef("Completed Between", "this_month")],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [],
      filters: [
        { column: "status", op: "eq", value: "completed" },
        ...dateRangeFilters("completed_at", params, { datetime: true }),
      ],
      groupBy: ["client_name"],
      aggregates: [
        { column: "*", fn: "count" },
        { column: "revenue_cents", fn: "sum" },
        { column: "man_hours", fn: "sum" },
      ],
      sortColumn: "count_all",
      sortDir: "desc",
    }),
  },
  {
    key: "client-contracts",
    section: "client",
    name: "Client Contracts",
    description:
      "Shows a single-line summary of all client contracts including billing day and monthly amounts.",
    filters: [
      dateRangeFilterDef("Contract Start Between", "all_time"),
      { key: "active_only", label: "Active Only", type: "checkbox", defaultValue: "true" },
    ],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "all_time");
      let query = supabase
        .from("crm_contracts")
        .select(
          "title, status, start_date, end_date, billing_day_of_month, monthly_amount_cents, monthly_amounts, is_active, clients:client_id(display_name)"
        )
        .is("deleted_at", null);
      if (params.active_only !== "false") query = query.eq("is_active", true);
      if (from) query = query.gte("start_date", from);
      if (to) query = query.lte("start_date", to);
      const { data, error } = await query.order("start_date", { ascending: false });
      if (error) throw new Error(error.message);

      type Row = {
        title: string | null;
        status: string | null;
        start_date: string | null;
        end_date: string | null;
        billing_day_of_month: number | null;
        monthly_amount_cents: number | null;
        monthly_amounts: Record<string, number> | null;
        clients: { display_name: string | null } | null;
      };
      const rows = ((data ?? []) as unknown as Row[]).map((r) => {
        const months: Record<string, number> = {};
        let total = 0;
        for (const m of MONTH_KEYS) {
          const cents = r.monthly_amounts?.[m] ?? r.monthly_amount_cents ?? 0;
          months[m] = cents;
          total += cents;
        }
        return {
          client_name: r.clients?.display_name ?? "",
          title: r.title,
          status: r.status,
          start_date: r.start_date,
          end_date: r.end_date,
          day: r.billing_day_of_month,
          ...months,
          total_cents: total,
        };
      });

      return buildResult(
        [
          col("client_name", "Client"),
          col("title", "Contract"),
          col("status", "Status"),
          col("start_date", "Start", "date"),
          col("end_date", "End", "date"),
          col("day", "Day", "number", false),
          ...MONTH_KEYS.map((m, i) => col(m, MONTH_LABELS[i], "money")),
          col("total_cents", "Annual Total", "money"),
        ],
        rows,
        ["Monthly columns use the contract's per-month schedule when set, otherwise the flat monthly amount."]
      );
    },
  },
];
