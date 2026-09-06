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
import { runAnalysis } from "@/lib/reports/engine";
import { CLIENT_STATUSES, isClientStatus, isLeadStatus } from "@/lib/reports/client-status";
import { nyDateParts, ymd } from "@/lib/reports/ny-date";
import type { AnalysisFilter } from "@/types/crm-reports";

// ============================================================
// Client section — pre-built reports.
// ============================================================

/** Analysis filter: only accounts that are/were clients (excludes lead + lost). */
const CLIENT_STATUS_FILTER: AnalysisFilter = {
  column: "status",
  op: "in",
  value: [...CLIENT_STATUSES],
};

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
      {
        key: "sort_by",
        label: "Sort By",
        type: "select",
        defaultValue: "client_name",
        options: [
          { value: "client_name", label: "Client Name" },
          { value: "balance_outstanding_cents", label: "Account Balance" },
          { value: "sales_rep", label: "Sales Rep" },
        ],
      },
    ],
    analysis: (params) => {
      const sortColumn = ["client_name", "balance_outstanding_cents", "sales_rep"].includes(params.sort_by ?? "")
        ? params.sort_by
        : "client_name";
      return {
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
        sortColumn,
        sortDir: sortColumn === "balance_outstanding_cents" ? "desc" : "asc",
      };
    },
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
        CLIENT_STATUS_FILTER,
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
        options: CLIENT_STATUSES.map((s) => ({
          value: s,
          label: s.charAt(0).toUpperCase() + s.slice(1),
        })),
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
        CLIENT_STATUS_FILTER,
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
        CLIENT_STATUS_FILTER,
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
        .select("cancellation_reason, source, billing_zip, closed_at, sales_rep_id, sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name)")
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
        sales_rep: { first_name: string | null; last_name: string | null } | null;
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
        ...breakdown("By Sales Rep", (r) => `${r.sales_rep?.first_name ?? ""} ${r.sales_rep?.last_name ?? ""}`.trim()),
        ...breakdown("By Postal Code", (r) => r.billing_zip ?? ""),
      ];

      return buildResult(
        [
          col("group_type", "Breakdown"),
          col("group_value", "Value"),
          col("count", "Count", "number", false),
          col("percent", "Percent", "percent"),
        ],
        resultRows,
        undefined,
        "group_type"
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
        .select("source, billing_zip, client_since, sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name)")
        .in("status", [...CLIENT_STATUSES])
        .is("deleted_at", null);
      if (from) query = query.gte("client_since", from);
      if (to) query = query.lte("client_since", to);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      type Row = {
        source: string | null;
        billing_zip: string | null;
        sales_rep: { first_name: string | null; last_name: string | null } | null;
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
        ...breakdown("By Sales Rep", (r) => `${r.sales_rep?.first_name ?? ""} ${r.sales_rep?.last_name ?? ""}`.trim()),
      ];

      return buildResult(
        [
          col("group_type", "Breakdown"),
          col("group_value", "Value"),
          col("count", "Count", "number", false),
          col("percent", "Percent", "percent"),
        ],
        resultRows,
        undefined,
        "group_type"
      );
    },
  },
  {
    key: "clients-by-completed-jobs",
    section: "client",
    name: "Clients Report by Completed Visits",
    description:
      "Shows which clients were served in any defined time frame — completed visits, revenue, and man-hours per client.",
    filters: [dateRangeFilterDef("Completed Between", "this_month")],
    notes: ["Counts completed visits (a recurring job contributes one row per completed visit), not distinct jobs."],
    // Declarative aggregates always label count(*) as "Count"; this runs the
    // same analysis and relabels that one column so the header says what the
    // number actually is.
    run: async ({ supabase, params }) => {
      const result = await runAnalysis(supabase, {
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
      });
      return {
        ...result,
        columns: result.columns.map((c) =>
          c.key === "count_all" ? { ...c, label: "Completed Visits" } : c
        ),
      };
    },
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
  {
    key: "clients-leads-monthly-matrix",
    section: "client",
    name: "Clients/Leads Monthly Matrix",
    description: "New clients, new leads, conversion rate, and terminations for the last 3 months.",
    filters: [],
    notes: [
      "New Leads = accounts created in the month (any current status). Converted = accounts whose Client Since date falls in the month and that are/were clients. Conversion % = Converted ÷ New Leads.",
    ],
    run: async ({ supabase }) => {
      // Month boundaries as they read in America/New_York (the org's operating
      // timezone) — a UTC-derived month would roll over hours early.
      const { year: nyYear, month: nyMonth } = nyDateParts(new Date());
      const months = [2, 1, 0].map((back) => {
        const d = new Date(Date.UTC(nyYear, nyMonth - back, 1));
        const y = d.getUTCFullYear();
        const m = d.getUTCMonth();
        return {
          key: `${y}-${String(m + 1).padStart(2, "0")}`,
          label: `${MONTH_LABELS[m]} ${y}`,
          start: ymd(y, m, 1),
          end: ymd(y, m + 1, 0),
        };
      });
      const earliestStart = months[0].start;

      const { data, error } = await supabase
        .from("clients")
        .select("status, client_since, created_at, closed_at")
        .is("deleted_at", null)
        .or(
          `client_since.gte.${earliestStart},created_at.gte.${earliestStart},closed_at.gte.${earliestStart}`
        )
        .limit(10000);
      if (error) throw new Error(error.message);

      type Row = {
        status: string | null;
        client_since: string | null;
        created_at: string | null;
        closed_at: string | null;
      };
      const rows = (data ?? []) as unknown as Row[];

      // `client_since` is a date; `created_at`/`closed_at` are timestamptz, so
      // take the NY calendar date of those instants before comparing.
      function toNyDay(dateStr: string | null): string | null {
        if (!dateStr) return null;
        if (dateStr.length === 10) return dateStr;
        const { year, month, day } = nyDateParts(new Date(dateStr));
        return ymd(year, month, day);
      }
      function inMonth(dateStr: string | null, m: (typeof months)[number]): boolean {
        const d = toNyDay(dateStr);
        return !!d && d >= m.start && d <= m.end;
      }

      const newClients: Record<string, number> = {};
      const newLeads: Record<string, number> = {};
      const terminated: Record<string, number> = {};
      for (const m of months) {
        // Converted in month: became a client (client_since) that month and is
        // still a client-status account. 'lost' leads never have client_since.
        newClients[m.key] = rows.filter((r) => isClientStatus(r.status) && inMonth(r.client_since, m)).length;
        // New leads: every account created that month, whatever it is now —
        // a lead that converted or was lost still started as a lead.
        newLeads[m.key] = rows.filter((r) => inMonth(r.created_at, m)).length;
        terminated[m.key] = rows.filter((r) => r.status === "cancelled" && inMonth(r.closed_at, m)).length;
      }

      const metricRow = (
        label: string,
        values: Record<string, number>,
        format: (n: number) => string | number
      ) => {
        const out: Record<string, string | number> = { metric: label };
        for (const m of months) out[m.key] = format(values[m.key]);
        return out;
      };

      const resultRows = [
        metricRow("New Clients (Converted)", newClients, (n) => n),
        metricRow("New Leads", newLeads, (n) => n),
        {
          metric: "Conversion %",
          ...Object.fromEntries(
            months.map((m) => [
              m.key,
              newLeads[m.key] > 0 ? Math.round((newClients[m.key] / newLeads[m.key]) * 1000) / 10 : 0,
            ])
          ),
        },
        metricRow("Terminated", terminated, (n) => n),
      ];

      return buildResult(
        [
          col("metric", "Metric"),
          ...months.map((m) => col(m.key, m.label, "number", false)),
        ],
        resultRows
      );
    },
  },
  {
    key: "clients-leads-stats",
    section: "client",
    name: "Clients and Leads",
    description: "New leads, converted leads, average days to convert, and cancellations for a date range, plus current totals.",
    filters: [dateRangeFilterDef("Date Range", "this_year")],
    notes: [
      "New Leads = accounts created in range that are still leads (open or lost). Converted Leads = accounts whose Client Since date falls in range. Avg Days to Convert = created → Client Since, over converted accounts whose Client Since is after their created date (accounts created directly as clients are excluded). Total Clients = active + inactive + cancelled; Total Leads = open leads only.",
    ],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");

      const { data, error } = await supabase
        .from("clients")
        .select("status, client_since, created_at, closed_at")
        .is("deleted_at", null)
        .limit(20000);
      if (error) throw new Error(error.message);

      type Row = {
        status: string | null;
        client_since: string | null;
        created_at: string | null;
        closed_at: string | null;
      };
      const rows = (data ?? []) as unknown as Row[];

      // `client_since` is a date; `created_at`/`closed_at` are timestamptz —
      // compare on the NY calendar date so the range edges are inclusive.
      function toNyDay(dateStr: string | null): string | null {
        if (!dateStr) return null;
        if (dateStr.length === 10) return dateStr;
        const { year, month, day } = nyDateParts(new Date(dateStr));
        return ymd(year, month, day);
      }
      function inRange(dateStr: string | null): boolean {
        const d = toNyDay(dateStr);
        return !!d && (!from || d >= from) && (!to || d <= to);
      }

      const newLeads = rows.filter((r) => isLeadStatus(r.status) && inRange(r.created_at));
      const convertedLeads = rows.filter((r) => isClientStatus(r.status) && inRange(r.client_since));
      const cancelledClients = rows.filter((r) => r.status === "cancelled" && inRange(r.closed_at));
      const totalClients = rows.filter((r) => isClientStatus(r.status)).length;
      const totalLeads = rows.filter((r) => r.status === "lead").length;

      // Days from account creation to conversion. Only accounts that actually
      // spent time as a lead count — client_since strictly after the created
      // date; same-day/backfilled rows would drag the average toward 0.
      const convertDays = convertedLeads
        .map((r) => ({ since: toNyDay(r.client_since), created: toNyDay(r.created_at) }))
        .filter((r): r is { since: string; created: string } => !!r.since && !!r.created && r.since > r.created)
        .map((r) => (Date.parse(`${r.since}T00:00:00Z`) - Date.parse(`${r.created}T00:00:00Z`)) / 86400000);
      const avgDaysToConvert =
        convertDays.length > 0
          ? Math.round((convertDays.reduce((a, b) => a + b, 0) / convertDays.length) * 100) / 100
          : 0;

      const resultRows = [
        { metric: "New Leads", value: newLeads.length },
        { metric: "Converted Leads", value: convertedLeads.length },
        { metric: "Avg Days to Convert", value: avgDaysToConvert },
        { metric: "Cancelled Clients", value: cancelledClients.length },
        { metric: "Total Clients", value: totalClients },
        { metric: "Total Leads", value: totalLeads },
      ];

      return buildResult(
        [col("metric", "Metric"), col("value", "Value", "number", false)],
        resultRows
      );
    },
  },
];
