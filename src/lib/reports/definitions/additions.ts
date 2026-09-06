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
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { isoNy, shiftYmd } from "@/lib/reports/ny-date";

// ============================================================
// Second-wave reports — SA parity gaps identified after the
// initial build-out (Forms, Paused Services, Sales Activity
// Detail, package renewals, Over/Under, usage lifecycle,
// 12-month projection).
// ============================================================

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** UTC offset (minutes) that America/New_York is at the given instant. */
function nyOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  const wallAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return Math.round((wallAsUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/**
 * The instant (ISO, UTC) at which a "YYYY-MM-DD" calendar day starts or ends
 * in America/New_York — for bounding a timestamptz column by a local day.
 * PostgREST compares timestamptz literals in the DB session's timezone
 * (UTC), so a bare `2026-09-06 00:00:00` would be 8pm the night before, ET.
 */
function nyDayBoundIso(ymdStr: string, edge: "start" | "end"): string {
  const [y, m, d] = ymdStr.split("-").map(Number);
  const wallAsUtc =
    edge === "start"
      ? Date.UTC(y, m - 1, d, 0, 0, 0, 0)
      : Date.UTC(y, m - 1, d, 23, 59, 59, 999);
  // Two passes so a DST transition on this very day resolves correctly.
  let utc = wallAsUtc - nyOffsetMinutes(wallAsUtc) * 60000;
  utc = wallAsUtc - nyOffsetMinutes(utc) * 60000;
  return new Date(utc).toISOString();
}

export const ADDITIONAL_REPORTS: PrebuiltReportDef[] = [
  {
    key: "forms-summary",
    section: "forms",
    name: "Forms Summary",
    description:
      "Shows forms and the number of responses received in any given time frame.",
    filters: [dateRangeFilterDef("Responses Between", "all_time")],
    notes: [
      "Responses marked Spam or Ignored are not counted. Date bounds are calendar days in Eastern time.",
    ],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "all_time");

      interface FormRow {
        id: string;
        name: string | null;
        description: string | null;
        status: string | null;
        created_at: string;
      }
      interface RespRow {
        form_id: string | null;
        created_at: string;
      }
      const forms = await fetchAllRows<FormRow>(() =>
        supabase
          .from("crm_forms")
          .select("id, name, description, status, created_at")
          .is("deleted_at", null)
      );

      // crm_form_responses.created_at is timestamptz — bound it by the
      // Eastern calendar day, not a bare (UTC-interpreted) literal.
      const responses = await fetchAllRows<RespRow>(() => {
        let respQuery = supabase
          .from("crm_form_responses")
          .select("form_id, created_at")
          .is("deleted_at", null)
          // crm_form_responses.status CHECK: on_hold | completed | spam | ignored
          .not("status", "in", '("spam","ignored")');
        if (from) respQuery = respQuery.gte("created_at", nyDayBoundIso(from, "start"));
        if (to) respQuery = respQuery.lte("created_at", nyDayBoundIso(to, "end"));
        return respQuery;
      });

      const counts = new Map<string, { count: number; last: string }>();
      for (const r of responses) {
        if (!r.form_id) continue;
        const entry = counts.get(r.form_id) ?? { count: 0, last: "" };
        entry.count += 1;
        if (r.created_at > entry.last) entry.last = r.created_at;
        counts.set(r.form_id, entry);
      }

      const rows = forms.map((f) => ({
        name: f.name,
        description: f.description,
        status: f.status,
        responses: counts.get(f.id)?.count ?? 0,
        last_response: counts.get(f.id)?.last || null,
        created_at: f.created_at,
      }));
      rows.sort((a, b) => b.responses - a.responses);

      return buildResult(
        [
          col("name", "Form"),
          col("description", "Description"),
          col("status", "Status"),
          col("responses", "Responses", "number", true),
          col("last_response", "Last Response", "datetime"),
          col("created_at", "Created", "date"),
        ],
        rows
      );
    },
  },
  {
    key: "paused-services",
    section: "schedule_lists",
    name: "Paused Services",
    description: "Shows jobs that have been placed on hold.",
    filters: [],
    analysis: () => ({
      dataset: "rpt_jobs",
      columns: [
        "client_name",
        "service_names",
        "job_type",
        "sub_status",
        "scheduled_date",
        "crew_name",
        "rate_cents",
        "budgeted_hours",
      ],
      filters: [{ column: "status", op: "eq", value: "hold" }],
      groupBy: [],
      aggregates: [],
      sortColumn: "client_name",
      sortDir: "asc",
    }),
  },
  {
    key: "sales-activity-detail",
    section: "revenue",
    name: "Sales Activity Detail",
    description:
      "Shows which sales rep sold what service and to whom, with per-visit revenue detail.",
    filters: [
      dateRangeFilterDef("Completed Between", "this_month"),
      { key: "sales_rep", label: "Sales Rep", type: "select", optionsSource: "salesReps" },
    ],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "sales_rep",
        "completed_at",
        "client_name",
        "service_names",
        "revenue_cents",
        "man_hours",
        "rev_per_man_hr_cents",
        "service_city",
        "service_zip",
      ],
      filters: [
        { column: "status", op: "eq", value: "completed" },
        ...dateRangeFilters("completed_at", params, { datetime: true }),
        ...eqFilter("sales_rep", params.sales_rep),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "completed_at",
      sortDir: "desc",
    }),
  },
  {
    key: "custom-package-renewal",
    section: "service",
    name: "Custom Package Renewal Report",
    description: "A list of packages with a renewal setting, ready to renew.",
    filters: [],
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .from("crm_jobs")
        .select(
          "package_name, package_renewal, package_step, package_total_steps, scheduled_date, rate_cents, total_cents, status, clients:client_id(display_name)"
        )
        .eq("job_type", "package")
        .not("package_renewal", "is", null)
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw new Error(error.message);

      interface Row {
        package_name: string | null;
        package_renewal: string | null;
        package_step: number | null;
        package_total_steps: number | null;
        scheduled_date: string | null;
        rate_cents: number | null;
        total_cents: number | null;
        status: string | null;
        clients: { display_name: string | null } | null;
      }
      const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
        client_name: r.clients?.display_name ?? "",
        package_name: r.package_name,
        renewal: r.package_renewal,
        step: r.package_step,
        total_steps: r.package_total_steps,
        scheduled_date: r.scheduled_date,
        status: r.status,
        total_cents: r.total_cents ?? r.rate_cents ?? 0,
      }));
      rows.sort((a, b) => (a.client_name > b.client_name ? 1 : -1));

      return buildResult(
        [
          col("client_name", "Client"),
          col("package_name", "Package"),
          col("renewal", "Renewal"),
          col("step", "Step", "number", false),
          col("total_steps", "Total Steps", "number", false),
          col("scheduled_date", "Scheduled", "date"),
          col("status", "Status"),
          col("total_cents", "Amount", "money"),
        ],
        rows
      );
    },
  },
  {
    key: "over-under",
    section: "service",
    name: "Over / Under Report",
    description:
      "Contract budgeted-to-date vs. invoiced-to-date revenue for each active contract.",
    filters: [],
    run: async ({ supabase }) => {
      const { data: contracts, error } = await supabase
        .from("crm_contracts")
        .select(
          "id, title, status, start_date, end_date, monthly_amount_cents, monthly_amounts, clients:client_id(display_name)"
        )
        .eq("is_active", true)
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw new Error(error.message);

      interface ContractRow {
        id: string;
        title: string | null;
        status: string | null;
        start_date: string | null;
        end_date: string | null;
        monthly_amount_cents: number | null;
        monthly_amounts: Record<string, number> | null;
        clients: { display_name: string | null } | null;
      }
      const contractRows = (contracts ?? []) as unknown as ContractRow[];

      const ids = contractRows.map((c) => c.id);
      const invoicedByContract = new Map<string, { invoiced: number; paid: number }>();
      if (ids.length > 0) {
        const { data: invoices, error: invError } = await supabase
          .from("crm_invoices")
          .select("contract_id, total_cents, amount_paid_cents, status")
          .in("contract_id", ids)
          .is("deleted_at", null)
          .in("status", ISSUED_INVOICE_STATUSES)
          .limit(5000);
        if (invError) throw new Error(invError.message);
        interface InvRow {
          contract_id: string | null;
          total_cents: number | null;
          amount_paid_cents: number | null;
        }
        for (const inv of (invoices ?? []) as InvRow[]) {
          if (!inv.contract_id) continue;
          const entry = invoicedByContract.get(inv.contract_id) ?? { invoiced: 0, paid: 0 };
          entry.invoiced += inv.total_cents ?? 0;
          entry.paid += inv.amount_paid_cents ?? 0;
          invoicedByContract.set(inv.contract_id, entry);
        }
      }

      const monthKeys = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
      // "This month" as it appears in America/New_York — a server running in
      // UTC would otherwise flip to next month at 8pm ET on the last day.
      const todayNy = isoNy(new Date());
      const monthIndex = (ymdStr: string) => {
        const [y, m] = ymdStr.split("-").map(Number);
        return y * 12 + (m - 1); // months since year 0 — comparable/iterable
      };
      const rows = contractRows.map((c) => {
        // budget = sum of monthly amounts from start month through the current
        // (or end) month, using the per-month schedule when present
        let budgeted = 0;
        let months = 0;
        if (c.start_date) {
          const startIdx = monthIndex(c.start_date);
          const lastIdx = Math.min(
            monthIndex(todayNy),
            c.end_date ? monthIndex(c.end_date) : Number.POSITIVE_INFINITY
          );
          for (let idx = startIdx; idx <= lastIdx && months < 120; idx += 1) {
            budgeted += c.monthly_amounts?.[monthKeys[idx % 12]] ?? c.monthly_amount_cents ?? 0;
            months += 1;
          }
        }
        const inv = invoicedByContract.get(c.id) ?? { invoiced: 0, paid: 0 };
        return {
          client_name: c.clients?.display_name ?? "",
          title: c.title,
          start_date: c.start_date,
          months_elapsed: months,
          budgeted_cents: budgeted,
          invoiced_cents: inv.invoiced,
          paid_cents: inv.paid,
          over_under_cents: inv.invoiced - budgeted,
        };
      });
      rows.sort((a, b) => a.over_under_cents - b.over_under_cents);

      return buildResult(
        [
          col("client_name", "Client"),
          col("title", "Contract"),
          col("start_date", "Start", "date"),
          col("months_elapsed", "Months Elapsed", "number", false),
          col("budgeted_cents", "Budgeted to Date", "money"),
          col("invoiced_cents", "Invoiced to Date", "money"),
          col("paid_cents", "Paid to Date", "money"),
          col("over_under_cents", "Over / (Under)", "money"),
        ],
        rows,
        [
          "Budgeted to Date sums the contract's monthly amounts from the start month through today (or the contract end).",
          "Over / (Under) is invoiced-to-date minus budgeted-to-date.",
          "A contract that starts mid-month is still credited a full month's budget for that first month.",
        ]
      );
    },
  },
  {
    key: "product-service-usage",
    section: "service",
    name: "Product and Service Usage",
    description:
      "Shows quantity and amount for each service across three stages: Estimate, Job, and Invoice.",
    filters: [],
    run: async ({ supabase }) => {
      interface Bucket {
        est_qty: number;
        est_cents: number;
        job_qty: number;
        job_cents: number;
        inv_qty: number;
        inv_cents: number;
      }
      const buckets = new Map<string, Bucket>();
      const bucket = (name: string): Bucket => {
        const key = name || "(unnamed)";
        let entry = buckets.get(key);
        if (!entry) {
          entry = { est_qty: 0, est_cents: 0, job_qty: 0, job_cents: 0, inv_qty: 0, inv_cents: 0 };
          buckets.set(key, entry);
        }
        return entry;
      };

      interface EstLine {
        service_name: string | null;
        qty: number | null;
        total_cents: number | null;
      }
      const estLines = await fetchAllRows<EstLine>(() =>
        supabase
          .from("estimate_line_items")
          .select("service_name, qty, total_cents, estimates!inner(deleted_at)")
          .is("deleted_at", null)
          .is("estimates.deleted_at", null)
      );
      for (const li of estLines) {
        const b = bucket(li.service_name ?? "");
        b.est_qty += Number(li.qty ?? 0);
        b.est_cents += li.total_cents ?? 0;
      }

      // crm_job_services has no deleted_at of its own — the job's soft delete
      // (and cancellation) is what retires its lines.
      interface JobLine {
        service_name: string | null;
        qty: number | null;
        rate_cents: number | null;
      }
      const jobLines = await fetchAllRows<JobLine>(() =>
        supabase
          .from("crm_job_services")
          .select("service_name, qty, rate_cents, crm_jobs!inner(deleted_at, status)")
          .is("crm_jobs.deleted_at", null)
          .neq("crm_jobs.status", "cancelled")
      );
      for (const li of jobLines) {
        const b = bucket(li.service_name ?? "");
        const qty = Number(li.qty ?? 1) || 1;
        b.job_qty += qty;
        b.job_cents += Math.round(qty * (li.rate_cents ?? 0));
      }

      // Issued-invoice rule (helpers.ts Rule A): drafts aren't revenue yet and
      // void invoices never were; deleted invoices' lines are orphans.
      interface InvLine {
        name: string | null;
        description: string | null;
        qty: number | null;
        total_cents: number | null;
      }
      const invLines = await fetchAllRows<InvLine>(() =>
        supabase
          .from("crm_invoice_line_items")
          .select("name, description, qty, total_cents, crm_invoices!inner(status, deleted_at)")
          .is("crm_invoices.deleted_at", null)
          .in("crm_invoices.status", [...ISSUED_INVOICE_STATUSES])
      );
      for (const li of invLines) {
        const b = bucket(li.name ?? li.description ?? "");
        b.inv_qty += Number(li.qty ?? 0);
        b.inv_cents += li.total_cents ?? 0;
      }

      const rows = [...buckets.entries()].map(([name, b]) => ({
        name,
        est_qty: Math.round(b.est_qty * 100) / 100,
        est_cents: b.est_cents,
        job_qty: Math.round(b.job_qty * 100) / 100,
        job_cents: b.job_cents,
        inv_qty: Math.round(b.inv_qty * 100) / 100,
        inv_cents: b.inv_cents,
      }));
      rows.sort((a, b) => b.inv_cents - a.inv_cents);

      return buildResult(
        [
          col("name", "Service / Product"),
          col("est_qty", "Estimate Qty", "number", false),
          col("est_cents", "Estimate Amount", "money"),
          col("job_qty", "Job Qty", "number", false),
          col("job_cents", "Job Amount", "money"),
          col("inv_qty", "Invoiced Qty", "number", false),
          col("inv_cents", "Invoiced Amount", "money"),
        ],
        rows,
        [
          "Amounts exclude sales tax. Job amount is line qty × rate on the job's service lines (the sold template), not per-visit delivery — for a recurring job this is a single snapshot, not a sum across every visit, so it won't reconcile 1:1 against Invoiced Amount.",
          "Excludes deleted estimates/jobs/invoices, cancelled jobs, and draft or void invoices.",
        ]
      );
    },
  },
  {
    key: "revenue-projection",
    section: "service",
    name: "Revenue and Budgeted Hours Projection",
    description:
      "Projects budgeted man hours and revenue for the next 12 months from currently scheduled visits.",
    filters: [],
    run: async ({ supabase }) => {
      // Calendar dates in America/New_York, not UTC.
      const today = isoNy(new Date());
      const horizonStr = shiftYmd(today, 365);

      interface Row {
        scheduled_date: string;
        budgeted_hours: number | null;
        revenue_cents: number | null;
      }
      // rpt_job_visits already computes revenue + coalesced budgeted hours.
      // Dispatched visits are still future work (on the board, not started).
      const data = await fetchAllRows<Row>(() =>
        supabase
          .from("rpt_job_visits")
          .select("scheduled_date, budgeted_hours, revenue_cents")
          .in("status", ["scheduled", "dispatched"])
          .gte("scheduled_date", today)
          .lte("scheduled_date", horizonStr)
      );

      const byMonth = new Map<string, { hours: number; revenue: number; visits: number }>();
      for (const v of data) {
        const key = monthKey(v.scheduled_date);
        const entry = byMonth.get(key) ?? { hours: 0, revenue: 0, visits: 0 };
        entry.hours += Number(v.budgeted_hours ?? 0);
        entry.revenue += v.revenue_cents ?? 0;
        entry.visits += 1;
        byMonth.set(key, entry);
      }

      const rows = [...byMonth.entries()]
        .sort((a, b) => (a[0] > b[0] ? 1 : -1))
        .map(([month, v]) => ({
          month,
          visits: v.visits,
          budgeted_hours: Math.round(v.hours * 100) / 100,
          projected_revenue_cents: v.revenue,
        }));

      return buildResult(
        [
          col("month", "Month"),
          col("visits", "Scheduled Visits", "number", true),
          col("budgeted_hours", "Budgeted Man-Hours", "hours"),
          col("projected_revenue_cents", "Projected Revenue", "money"),
        ],
        rows,
        [
          "Based on visits currently in Scheduled or Dispatched status from today through the next 365 days (Eastern calendar dates).",
          "Budgeted Man-Hours are duration × number of men.",
        ]
      );
    },
  },
];
