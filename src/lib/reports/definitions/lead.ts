import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  dateRangeFilterDef,
  MONTH_LABELS,
  resolveDateRange,
} from "@/lib/reports/helpers";
import { isClientStatus, isLeadStatus } from "@/lib/reports/client-status";
import { nyDateParts, shiftYmd, ymd } from "@/lib/reports/ny-date";

// ============================================================
// Lead section — pre-built reports.
//
// Leads live in `clients` (status 'lead' while open, 'lost' once closed
// without converting). `client_since` is the conversion date and is NULL
// for both lead statuses — see src/lib/reports/client-status.ts.
// ============================================================

/** The America/New_York calendar date of a date or timestamptz string. */
function toNyDay(value: string | null): string | null {
  if (!value) return null;
  if (value.length === 10) return value;
  const { year, month, day } = nyDateParts(new Date(value));
  return ymd(year, month, day);
}

type ClientRowFilter = { column: string; op: "eq" | "gte" | "lte"; value: string };

/**
 * Fetch every non-deleted `clients` row for the caller's org in pages, so a
 * large org isn't silently truncated by a single `.limit(n)`.
 */
async function fetchAllClients<Row>(
  supabase: SupabaseClient,
  select: string,
  filters: ClientRowFilter[] = []
): Promise<Row[]> {
  const PAGE = 1000;
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let query = supabase.from("clients").select(select).is("deleted_at", null);
    for (const f of filters) {
      if (f.op === "eq") query = query.eq(f.column, f.value);
      else if (f.op === "gte") query = query.gte(f.column, f.value);
      else query = query.lte(f.column, f.value);
    }
    const { data, error } = await query.order("id").range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

export const LEAD_REPORTS: PrebuiltReportDef[] = [
  {
    key: "new-leads",
    section: "lead",
    name: "New Leads Report",
    description: "Shows new leads received in any defined time frame.",
    filters: [dateRangeFilterDef("Received Between", "this_month")],
    notes: [
      "Accounts created in the range that started as a lead: still a lead (open or lost), or converted to a client after the day they were created. Accounts created directly as clients are excluded.",
    ],
    // Bespoke: the declarative engine can't compare two columns
    // (client_since > created_at), and that comparison is what separates a
    // lead that later converted from an account created straight as a client.
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_month");

      interface Row {
        display_name: string | null;
        source: string | null;
        status: string | null;
        created_at: string | null;
        client_since: string | null;
        billing_city: string | null;
        primary_phone: string | null;
        primary_email: string | null;
        sales_rep: { first_name: string | null; last_name: string | null } | null;
      }
      // Inclusive NY-day bounds on a timestamptz: the from-day starts at
      // 00:00 NY (04:00/05:00 UTC), so widen by a day each side here and
      // apply the exact NY-date check below.
      const createdFilters: ClientRowFilter[] = [];
      if (from) createdFilters.push({ column: "created_at", op: "gte", value: `${shiftYmd(from, -1)}T00:00:00Z` });
      if (to) createdFilters.push({ column: "created_at", op: "lte", value: `${shiftYmd(to, 2)}T00:00:00Z` });
      const rows = await fetchAllClients<Row>(
        supabase,
        "display_name, source, status, created_at, client_since, billing_city, primary_phone, primary_email, sales_rep:crm_employees!clients_sales_rep_id_fkey(first_name,last_name)",
        createdFilters
      );

      const resultRows = rows
        .filter((r) => {
          const created = toNyDay(r.created_at);
          if (!created) return false;
          if (from && created < from) return false;
          if (to && created > to) return false;
          if (isLeadStatus(r.status)) return true;
          // Converted later than the day it was created → it started as a lead.
          const since = toNyDay(r.client_since);
          return !!since && since > created;
        })
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .map((r) => ({
          display_name: r.display_name,
          source: r.source,
          status: r.status,
          sales_rep: `${r.sales_rep?.first_name ?? ""} ${r.sales_rep?.last_name ?? ""}`.trim() || null,
          created_at: r.created_at,
          client_since: r.client_since,
          billing_city: r.billing_city,
          primary_phone: r.primary_phone,
          primary_email: r.primary_email,
        }));

      return buildResult(
        [
          col("display_name", "Client Name"),
          col("source", "Source"),
          col("status", "Status"),
          col("sales_rep", "Sales Rep"),
          col("created_at", "Created At", "datetime"),
          col("client_since", "Client Since", "date"),
          col("billing_city", "Billing City"),
          col("primary_phone", "Phone"),
          col("primary_email", "Email"),
        ],
        resultRows
      );
    },
  },
  {
    key: "lead-aging-summary",
    section: "lead",
    name: "Lead Aging Summary",
    description: "Shows how long open leads have been sitting, bucketed by age and source.",
    filters: [],
    run: async ({ supabase }) => {
      interface Row {
        source: string | null;
        created_at: string | null;
      }
      const rows = await fetchAllClients<Row>(supabase, "source, created_at", [
        { column: "status", op: "eq", value: "lead" },
      ]);

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
          col("d120_plus", "121+ Days", "number", true),
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
    notes: ["Leads closed without ever converting to a client (status = lost)."],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "this_year");
      let query = supabase
        .from("clients")
        .select("cancellation_reason, closed_at")
        // A closed lead is status 'lost' (cancelled = a real client who left).
        .eq("status", "lost")
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
        ["Leads closed without ever converting to a client (status = lost)."]
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
    notes: [
      "New Leads counts accounts created that month; totals are as of month end.",
      "Client Total = accounts that had converted (Client Since) by month end, are/were clients, and had not been cancelled by then. Lead Total = accounts created by month end that were still a lead at month end (open, converted later, or lost later).",
    ],
    run: async ({ supabase, params }) => {
      const year = parseInt(params.year || "", 10) || new Date().getFullYear();

      interface Row {
        status: string | null;
        created_at: string | null;
        client_since: string | null;
        closed_at: string | null;
      }
      const rows = await fetchAllClients<Row>(supabase, "status, created_at, client_since, closed_at");

      const resultRows = MONTH_LABELS.map((label, m) => {
        // Month edges as NY calendar dates; timestamps are reduced to their
        // NY date before comparing so the boundary isn't off by the UTC offset.
        const monthStart = ymd(year, m, 1);
        const monthEnd = ymd(year, m + 1, 0);

        const inMonth = (value: string | null): boolean => {
          const d = toNyDay(value);
          return !!d && d >= monthStart && d <= monthEnd;
        };
        const onOrBeforeEnd = (value: string | null): boolean => {
          const d = toNyDay(value);
          return !!d && d <= monthEnd;
        };
        const afterEnd = (value: string | null): boolean => {
          const d = toNyDay(value);
          return !!d && d > monthEnd;
        };

        const newLeads = rows.filter((r) => inMonth(r.created_at)).length;
        const converted = rows.filter(
          (r) => isClientStatus(r.status) && inMonth(r.client_since)
        ).length;
        const terminated = rows.filter(
          (r) => r.status === "cancelled" && inMonth(r.closed_at)
        ).length;
        // Clients on the books at month end: converted by then, a client-status
        // account, and not yet cancelled (cancelled rows keep closed_at).
        const clientTotal = rows.filter(
          (r) =>
            isClientStatus(r.status) &&
            onOrBeforeEnd(r.client_since) &&
            !(r.status === "cancelled" && onOrBeforeEnd(r.closed_at))
        ).length;
        // Leads open at month end: created by then and, at that point, not yet
        // converted (client_since later or never) nor closed as lost.
        const leadTotal = rows.filter((r) => {
          if (!onOrBeforeEnd(r.created_at)) return false;
          if (r.status === "lead") return true;
          if (isClientStatus(r.status)) return afterEnd(r.client_since);
          if (r.status === "lost") return afterEnd(r.closed_at);
          return false;
        }).length;

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
        resultRows
      );
    },
  },
  {
    key: "sales-summary-by-source",
    section: "lead",
    name: "Sales Summary by Source",
    description:
      "Shows lead, client, cancellation, and lost-lead counts by source with conversion percentage.",
    filters: [],
    notes: [
      "Conversion % = accounts that became clients (Clients + Cancelled) ÷ all accounts from the source (Leads + Clients + Cancelled + Lost).",
    ],
    run: async ({ supabase }) => {
      interface Row {
        source: string | null;
        status: string | null;
      }
      const rows = await fetchAllClients<Row>(supabase, "source, status");

      interface SourceSummary {
        source: string;
        leads: number;
        clients: number;
        cancelled: number;
        lost: number;
        total: number;
        conversion_pct: number;
      }
      const bySource = new Map<string, SourceSummary>();
      for (const r of rows) {
        const key = r.source || "(none)";
        let summary = bySource.get(key);
        if (!summary) {
          summary = { source: key, leads: 0, clients: 0, cancelled: 0, lost: 0, total: 0, conversion_pct: 0 };
          bySource.set(key, summary);
        }
        if (r.status === "lead") summary.leads += 1;
        else if (r.status === "active" || r.status === "inactive") summary.clients += 1;
        else if (r.status === "cancelled") summary.cancelled += 1;
        else if (r.status === "lost") summary.lost += 1;
        summary.total += 1;
      }
      for (const summary of bySource.values()) {
        const denominator = summary.leads + summary.clients + summary.cancelled + summary.lost;
        const converted = summary.clients + summary.cancelled;
        summary.conversion_pct =
          denominator > 0 ? Math.round((converted / denominator) * 1000) / 10 : 0;
      }

      const resultRows = [...bySource.values()].sort((a, b) => b.total - a.total);
      return buildResult(
        [
          col("source", "Source"),
          col("leads", "Leads", "number", true),
          col("clients", "Clients", "number", true),
          col("cancelled", "Cancelled", "number", true),
          col("lost", "Lost", "number", true),
          col("total", "Total", "number", true),
          col("conversion_pct", "Conversion %", "percent"),
        ],
        resultRows as unknown as Record<string, unknown>[]
      );
    },
  },
];

