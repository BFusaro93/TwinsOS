import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  dateRangeFilters,
  MONTH_LABELS,
  resolveDateRange,
} from "@/lib/reports/helpers";

// ============================================================
// Lead section — pre-built reports.
// ============================================================

export const LEAD_REPORTS: PrebuiltReportDef[] = [
  {
    key: "new-leads",
    section: "lead",
    name: "New Leads Report",
    description: "Shows new leads received in any defined time frame.",
    filters: [dateRangeFilterDef("Received Between", "this_month")],
    analysis: (params) => ({
      dataset: "rpt_clients",
      columns: [
        "display_name",
        "source",
        "sales_rep",
        "created_at",
        "billing_city",
        "primary_phone",
        "primary_email",
      ],
      filters: [
        { column: "status", op: "eq", value: "lead" },
        ...dateRangeFilters("created_at", params, { datetime: true, preset: "this_month" }),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "created_at",
      sortDir: "desc",
    }),
  },
  {
    key: "lead-aging-summary",
    section: "lead",
    name: "Lead Aging Summary",
    description: "Shows how long open leads have been sitting, bucketed by age and source.",
    filters: [],
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .from("clients")
        .select("source, created_at")
        .eq("status", "lead")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw new Error(error.message);

      interface Row {
        source: string | null;
        created_at: string | null;
      }
      const rows = (data ?? []) as unknown as Row[];

      interface Bucketed {
        source: string;
        d0_30: number;
        d31_60: number;
        d61_90: number;
        d91_120: number;
        d120_plus: number;
        total: number;
      }
      const now = Date.now();
      const bySource = new Map<string, Bucketed>();
      for (const r of rows) {
        const key = r.source || "(none)";
        let bucket = bySource.get(key);
        if (!bucket) {
          bucket = { source: key, d0_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120_plus: 0, total: 0 };
          bySource.set(key, bucket);
        }
        const created = r.created_at ? new Date(r.created_at).getTime() : now;
        const days = Math.floor((now - created) / 86400000);
        if (days <= 30) bucket.d0_30 += 1;
        else if (days <= 60) bucket.d31_60 += 1;
        else if (days <= 90) bucket.d61_90 += 1;
        else if (days <= 120) bucket.d91_120 += 1;
        else bucket.d120_plus += 1;
        bucket.total += 1;
      }

      const resultRows = [...bySource.values()].sort((a, b) => b.total - a.total);
      return buildResult(
        [
          col("source", "Source"),
          col("d0_30", "0-30 Days", "number", true),
          col("d31_60", "31-60 Days", "number", true),
          col("d61_90", "61-90 Days", "number", true),
          col("d91_120", "91-120 Days", "number", true),
          col("d120_plus", "120+ Days", "number", true),
          col("total", "Total", "number", true),
        ],
        resultRows as unknown as Record<string, unknown>[]
      );
    },
  },
  {
    key: "closed-leads-summary",
    section: "lead",
    name: "Closed Leads Summary",
    description: "Shows leads that were closed without converting, grouped by reason.",
    filters: [dateRangeFilterDef("Closed Between", "this_year")],
    notes: ["Leads closed without ever converting to a client."],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      let query = supabase
        .from("clients")
        .select("cancellation_reason, closed_at")
        .eq("status", "cancelled")
        .is("client_since", null)
        .is("deleted_at", null)
        .limit(5000);
      if (from) query = query.gte("closed_at", `${from} 00:00:00`);
      if (to) query = query.lte("closed_at", `${to} 23:59:59.999`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      interface Row {
        cancellation_reason: string | null;
      }
      const rows = (data ?? []) as unknown as Row[];
      const total = rows.length;

      const counts = new Map<string, number>();
      for (const r of rows) {
        const key = r.cancellation_reason || "(none)";
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const resultRows = [
        { reason: "Total", count: total, percent: 100 },
        ...[...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([reason, count]) => ({
            reason,
            count,
            percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
          })),
      ];

      return buildResult(
        [
          col("reason", "Reason"),
          col("count", "Count", "number", false),
          col("percent", "Percent", "percent"),
        ],
        resultRows,
        ["Leads closed without ever converting to a client."]
      );
    },
  },
  {
    key: "company-scorecard",
    section: "lead",
    name: "Company Scorecard",
    description:
      "Month-by-month view of new leads, conversions, terminations, and running client totals.",
    filters: [
      { key: "year", label: "Year", type: "number", defaultValue: String(new Date().getFullYear()) },
    ],
    notes: ["New Leads counts accounts created that month; totals are as of month end."],
    run: async ({ supabase, params }) => {
      const year = parseInt(params.year || "", 10) || new Date().getFullYear();
      const { data, error } = await supabase
        .from("clients")
        .select("status, created_at, client_since, closed_at")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw new Error(error.message);

      interface Row {
        status: string | null;
        created_at: string | null;
        client_since: string | null;
        closed_at: string | null;
      }
      const rows = (data ?? []) as unknown as Row[];

      const resultRows = MONTH_LABELS.map((label, m) => {
        const monthStart = new Date(year, m, 1).getTime();
        const monthEnd = new Date(year, m + 1, 0, 23, 59, 59, 999).getTime();

        const inMonth = (value: string | null): boolean => {
          if (!value) return false;
          const t = new Date(value).getTime();
          return t >= monthStart && t <= monthEnd;
        };
        const onOrBeforeEnd = (value: string | null): boolean => {
          if (!value) return false;
          return new Date(value).getTime() <= monthEnd;
        };

        const newLeads = rows.filter((r) => inMonth(r.created_at)).length;
        const converted = rows.filter(
          (r) => inMonth(r.client_since) && r.status !== "lead"
        ).length;
        const terminated = rows.filter(
          (r) => r.status === "cancelled" && inMonth(r.closed_at)
        ).length;
        const clientTotal = rows.filter(
          (r) => onOrBeforeEnd(r.client_since) && !onOrBeforeEnd(r.closed_at)
        ).length;
        const leadTotal = rows.filter(
          (r) => r.status === "lead" && onOrBeforeEnd(r.created_at)
        ).length;

        return {
          month: label,
          new_leads: newLeads,
          converted,
          terminated,
          client_total: clientTotal,
          lead_total: leadTotal,
        };
      });

      return buildResult(
        [
          col("month", "Month"),
          col("new_leads", "New Leads", "number", false),
          col("converted", "Converted", "number", false),
          col("terminated", "Terminated", "number", false),
          col("client_total", "Client Total", "number", false),
          col("lead_total", "Lead Total", "number", false),
        ],
        resultRows,
        ["New Leads counts accounts created that month; totals are as of month end."]
      );
    },
  },
  {
    key: "sales-summary-by-source",
    section: "lead",
    name: "Sales Summary by Source",
    description:
      "Shows lead, client, and cancellation counts by source with conversion percentage.",
    filters: [],
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .from("clients")
        .select("source, status")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw new Error(error.message);

      interface Row {
        source: string | null;
        status: string | null;
      }
      const rows = (data ?? []) as unknown as Row[];

      interface SourceSummary {
        source: string;
        leads: number;
        clients: number;
        cancelled: number;
        total: number;
        conversion_pct: number;
      }
      const bySource = new Map<string, SourceSummary>();
      for (const r of rows) {
        const key = r.source || "(none)";
        let summary = bySource.get(key);
        if (!summary) {
          summary = { source: key, leads: 0, clients: 0, cancelled: 0, total: 0, conversion_pct: 0 };
          bySource.set(key, summary);
        }
        if (r.status === "lead") summary.leads += 1;
        else if (r.status === "active" || r.status === "inactive") summary.clients += 1;
        else if (r.status === "cancelled") summary.cancelled += 1;
        summary.total += 1;
      }
      for (const summary of bySource.values()) {
        const denominator = summary.leads + summary.clients + summary.cancelled;
        summary.conversion_pct =
          denominator > 0 ? Math.round((summary.clients / denominator) * 1000) / 10 : 0;
      }

      const resultRows = [...bySource.values()].sort((a, b) => b.total - a.total);
      return buildResult(
        [
          col("source", "Source"),
          col("leads", "Leads", "number", true),
          col("clients", "Clients", "number", true),
          col("cancelled", "Cancelled", "number", true),
          col("total", "Total", "number", true),
          col("conversion_pct", "Conversion %", "percent"),
        ],
        resultRows as unknown as Record<string, unknown>[]
      );
    },
  },
];
