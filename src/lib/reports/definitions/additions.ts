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
// Second-wave reports — SA parity gaps identified after the
// initial build-out (Forms, Paused Services, Sales Activity
// Detail, package renewals, Over/Under, usage lifecycle,
// 12-month projection).
// ============================================================

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export const ADDITIONAL_REPORTS: PrebuiltReportDef[] = [
  {
    key: "forms-summary",
    section: "forms",
    name: "Forms Summary",
    description:
      "Shows forms and the number of responses received in any given time frame.",
    filters: [dateRangeFilterDef("Responses Between", "all_time")],
    run: async ({ supabase, params }) => {
      const { from, to } = resolveDateRange(params, "all_time");
      const { data: forms, error: formsError } = await supabase
        .from("crm_forms")
        .select("id, name, description, status, created_at")
        .is("deleted_at", null)
        .limit(5000);
      if (formsError) throw new Error(formsError.message);

      let respQuery = supabase
        .from("crm_form_responses")
        .select("form_id, created_at")
        .is("deleted_at", null)
        .limit(5000);
      if (from) respQuery = respQuery.gte("created_at", `${from} 00:00:00`);
      if (to) respQuery = respQuery.lte("created_at", `${to} 23:59:59.999`);
      const { data: responses, error: respError } = await respQuery;
      if (respError) throw new Error(respError.message);

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
      const counts = new Map<string, { count: number; last: string }>();
      for (const r of (responses ?? []) as RespRow[]) {
        if (!r.form_id) continue;
        const entry = counts.get(r.form_id) ?? { count: 0, last: "" };
        entry.count += 1;
        if (r.created_at > entry.last) entry.last = r.created_at;
        counts.set(r.form_id, entry);
      }

      const rows = ((forms ?? []) as FormRow[]).map((f) => ({
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
          .neq("status", "void")
          .is("deleted_at", null)
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
      const today = new Date();
      const rows = contractRows.map((c) => {
        // budget = sum of monthly amounts from start month through the current
        // (or end) month, using the per-month schedule when present
        let budgeted = 0;
        let months = 0;
        if (c.start_date) {
          const start = new Date(`${c.start_date}T00:00:00`);
          const end = c.end_date ? new Date(`${c.end_date}T00:00:00`) : today;
          const last = end < today ? end : today;
          const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
          while (cursor <= last && months < 120) {
            budgeted += c.monthly_amounts?.[monthKeys[cursor.getMonth()]] ?? c.monthly_amount_cents ?? 0;
            months += 1;
            cursor.setMonth(cursor.getMonth() + 1);
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

      const { data: estLines, error: estError } = await supabase
        .from("estimate_line_items")
        .select("service_name, qty, total_cents")
        .is("deleted_at", null)
        .limit(5000);
      if (estError) throw new Error(estError.message);
      for (const li of (estLines ?? []) as { service_name: string | null; qty: number | null; total_cents: number | null }[]) {
        const b = bucket(li.service_name ?? "");
        b.est_qty += Number(li.qty ?? 0);
        b.est_cents += li.total_cents ?? 0;
      }

      const { data: jobLines, error: jobError } = await supabase
        .from("crm_job_services")
        .select("service_name, qty, rate_cents")
        .limit(5000);
      if (jobError) throw new Error(jobError.message);
      for (const li of (jobLines ?? []) as { service_name: string | null; qty: number | null; rate_cents: number | null }[]) {
        const b = bucket(li.service_name ?? "");
        const qty = Number(li.qty ?? 1) || 1;
        b.job_qty += qty;
        b.job_cents += Math.round(qty * (li.rate_cents ?? 0));
      }

      const { data: invLines, error: invError } = await supabase
        .from("crm_invoice_line_items")
        .select("name, description, qty, total_cents")
        .limit(5000);
      if (invError) throw new Error(invError.message);
      for (const li of (invLines ?? []) as { name: string | null; description: string | null; qty: number | null; total_cents: number | null }[]) {
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
        ["Amounts exclude sales tax. Job amount is line qty × rate on the job's service lines."]
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
      const today = new Date().toISOString().slice(0, 10);
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 365);
      const horizonStr = horizon.toISOString().slice(0, 10);

      // rpt_job_visits already computes revenue + coalesced budgeted hours
      const { data, error } = await supabase
        .from("rpt_job_visits")
        .select("scheduled_date, budgeted_hours, revenue_cents")
        .eq("status", "scheduled")
        .gte("scheduled_date", today)
        .lte("scheduled_date", horizonStr)
        .limit(5000);
      if (error) throw new Error(error.message);

      interface Row {
        scheduled_date: string;
        budgeted_hours: number | null;
        revenue_cents: number | null;
      }
      const byMonth = new Map<string, { hours: number; revenue: number; visits: number }>();
      for (const v of (data ?? []) as Row[]) {
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
          col("budgeted_hours", "Budgeted Hours", "hours"),
          col("projected_revenue_cents", "Projected Revenue", "money"),
        ],
        rows,
        ["Based on visits currently in Scheduled status over the next 12 months."]
      );
    },
  },
];
