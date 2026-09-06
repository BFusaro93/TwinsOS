import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  containsFilter,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
} from "@/lib/reports/helpers";
import { fetchAllRows } from "@/lib/reports/fetch-all-rows";
import { isoNy } from "@/lib/reports/ny-date";

// ============================================================
// Service Reports section — pre-built reports.
// ============================================================

/** Visit statuses that still represent outstanding work: dispatched is
 *  "on the crew's board, not started" — same backlog bucket as scheduled. */
const OUTSTANDING_VISIT_STATUSES = ["scheduled", "dispatched"];

export const SERVICE_REPORTS: PrebuiltReportDef[] = [
  {
    key: "visits-report",
    section: "service",
    name: "Visits Report",
    description:
      "Shows all visits in any defined time frame with hours, revenue, and location detail.",
    filters: [
      dateRangeFilterDef("Scheduled Between", "this_month"),
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "scheduled", label: "Scheduled" },
          { value: "dispatched", label: "Dispatched" },
          { value: "in_progress", label: "In Progress" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
          { value: "skipped", label: "Skipped" },
        ],
      },
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
      { key: "zip", label: "Service Zip", type: "text", placeholder: "Any zip" },
    ],
    notes: ["Budgeted Man-Hours and Actual Man-Hours are both duration × number of men."],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "scheduled_date",
        "client_name",
        "service_names",
        "crew_name",
        "status",
        "budgeted_hours",
        // actual_hours and man_hours are the same figure in the view — show it once.
        "actual_hours",
        "revenue_cents",
        "rev_per_man_hr_cents",
        "service_city",
        "service_zip",
      ],
      filters: [
        ...dateRangeFilters("scheduled_date", params, { preset: "this_month" }),
        ...eqFilter("status", params.status),
        ...eqFilter("crew_name", params.crew),
        ...containsFilter("service_zip", params.zip),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "scheduled_date",
      sortDir: "asc",
    }),
  },
  {
    key: "backlog-services",
    section: "service",
    name: "Backlog Services",
    description: "Shows scheduled visits that have not been completed as of a cutoff date.",
    filters: [
      {
        key: "to",
        label: "Scheduled On or Before",
        type: "text",
        placeholder: "YYYY-MM-DD (default today)",
      },
    ],
    notes: [
      "Visits still in Scheduled or Dispatched status on or before the cutoff — work waiting to be started.",
    ],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "scheduled_date",
        "client_name",
        "service_names",
        "crew_name",
        "status",
        "budgeted_hours",
        "revenue_cents",
        "service_city",
      ],
      filters: [
        { column: "status", op: "in", value: OUTSTANDING_VISIT_STATUSES },
        {
          column: "scheduled_date",
          op: "lte",
          // "Today" as the calendar date in America/New_York, not UTC — the
          // UTC date rolls over at 8pm/7pm Eastern.
          value: params.to || isoNy(new Date()),
        },
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "scheduled_date",
      sortDir: "asc",
    }),
  },
  {
    key: "client-count-by-service",
    section: "service",
    name: "Client Count by Service",
    description: "Shows how many clients receive each service and the share of the client base.",
    filters: [],
    notes: [
      "Counts distinct clients with at least one non-cancelled job for the service. Percent is of all clients that have any such job, not of the whole client list.",
    ],
    run: async ({ supabase }) => {
      interface Row {
        service_name: string | null;
        crm_jobs: {
          client_id: string | null;
          status: string | null;
        } | null;
      }
      // Inner joins so deleted jobs / deleted clients / cancelled jobs are
      // dropped server-side (instead of consuming page slots and then being
      // filtered out here).
      const rows = await fetchAllRows<Row>(() =>
        supabase
          .from("crm_job_services")
          .select("service_name, crm_jobs!inner(client_id, status, clients!inner(deleted_at))")
          .is("crm_jobs.deleted_at", null)
          .neq("crm_jobs.status", "cancelled")
          .is("crm_jobs.clients.deleted_at", null)
      );

      const byService = new Map<string, Set<string>>();
      const allClients = new Set<string>();
      for (const r of rows) {
        const job = r.crm_jobs;
        if (!job || job.status === "cancelled") continue;
        if (!job.client_id) continue;
        const service = r.service_name || "(none)";
        let clients = byService.get(service);
        if (!clients) {
          clients = new Set<string>();
          byService.set(service, clients);
        }
        clients.add(job.client_id);
        allClients.add(job.client_id);
      }

      const total = allClients.size;
      const resultRows = [...byService.entries()]
        .map(([service_name, clients]) => ({
          service_name,
          client_count: clients.size,
          percent: total > 0 ? Math.round((clients.size / total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.client_count - a.client_count);

      return buildResult(
        [
          col("service_name", "Service"),
          col("client_count", "Client Count", "number", false),
          col("percent", "Percent of Clients", "percent"),
        ],
        resultRows
      );
    },
  },
  {
    key: "client-services-report",
    section: "service",
    name: "Client Services Report",
    description: "Shows the active services each client is signed up for.",
    filters: [
      {
        key: "job_type",
        label: "Job Type",
        type: "select",
        options: [
          { value: "recurring", label: "Recurring" },
          { value: "one_time", label: "One Time" },
          { value: "waiting_list", label: "Waiting List" },
          { value: "package", label: "Package" },
          { value: "snow", label: "Snow" },
          { value: "project", label: "Project" },
        ],
      },
    ],
    notes: [
      "Scheduled Date is blank for recurring and package jobs — only their individual visits carry dates (see the Visits Report).",
      "Rate is the job's per-visit rate, not a total — it is not summed in the totals row.",
    ],
    analysis: (params) => ({
      dataset: "rpt_jobs",
      columns: [
        "client_name",
        "job_type",
        "service_names",
        "scheduled_date",
        "crew_name",
        "rate_cents",
        "budgeted_hours",
        "service_address",
        "service_city",
        "service_zip",
      ],
      filters: [
        { column: "status", op: "in", value: ["scheduled", "in_progress"] },
        ...eqFilter("job_type", params.job_type),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "client_name",
      sortDir: "asc",
    }),
  },
  {
    key: "package-summary",
    section: "service",
    name: "Package Summary Report",
    description:
      "Shows visit progress and earned vs pending revenue for each service package.",
    filters: [],
    notes: [
      "Total Visits counts every visit on each package job, cancelled included; Completed counts visits in Completed status; Cancelled counts cancelled visits; Remaining is Total − Completed − Cancelled.",
      "Earned is completed visits × the per-visit amount — the visit's own rate × qty when set, otherwise the job total split evenly across its non-cancelled visits. Pending is the job total minus Earned. A package job with no visits generated yet shows entirely as Pending.",
    ],
    run: async ({ supabase }) => {
      interface Row {
        id: string;
        package_name: string | null;
        total_cents: number | null;
        scheduled_date: string | null;
      }
      const rows = await fetchAllRows<Row>(() =>
        supabase
          .from("crm_jobs")
          .select("id, package_name, total_cents, scheduled_date")
          .eq("job_type", "package")
          .is("deleted_at", null)
      );

      // A package job is one master record whose service is delivered across
      // many crm_job_visits rows (the job's own status/is_complete only flips
      // at the very end, and its scheduled_date is never populated), so
      // progress has to be measured per visit, not per job.
      interface VisitRow {
        job_id: string;
        scheduled_date: string | null;
        status: string | null;
        rate_cents: number | null;
        qty: number | null;
      }
      interface JobVisits {
        total: number;
        completed: number;
        cancelled: number;
        completedCents: number | null; // null until a completed visit lacks its own rate
        min: string | null;
        max: string | null;
      }
      const visitsByJob = new Map<string, JobVisits>();
      const jobIds = rows.map((r) => r.id);
      // .in() goes on the URL — chunk so a large org doesn't blow the length cap.
      for (let i = 0; i < jobIds.length; i += 200) {
        const chunk = jobIds.slice(i, i + 200);
        const visits = await fetchAllRows<VisitRow>(() =>
          supabase
            .from("crm_job_visits")
            .select("job_id, scheduled_date, status, rate_cents, qty")
            .in("job_id", chunk)
            .is("deleted_at", null)
        );
        for (const v of visits) {
          const jv = visitsByJob.get(v.job_id) ?? {
            total: 0,
            completed: 0,
            cancelled: 0,
            completedCents: 0,
            min: null,
            max: null,
          };
          jv.total += 1;
          if (v.status === "cancelled") jv.cancelled += 1;
          if (v.status === "completed") {
            jv.completed += 1;
            if (v.rate_cents != null && jv.completedCents !== null) {
              jv.completedCents += Math.round(v.rate_cents * (Number(v.qty) || 1));
            } else {
              // At least one completed visit has no explicit rate — fall
              // back to an even split of the job total (below).
              jv.completedCents = null;
            }
          }
          if (v.scheduled_date) {
            if (!jv.min || v.scheduled_date < jv.min) jv.min = v.scheduled_date;
            if (!jv.max || v.scheduled_date > jv.max) jv.max = v.scheduled_date;
          }
          visitsByJob.set(v.job_id, jv);
        }
      }

      interface Summary {
        package_name: string;
        total_visits: number;
        completed: number;
        cancelled: number;
        remaining: number;
        first_date: string | null;
        last_date: string | null;
        earned_cents: number;
        pending_cents: number;
      }
      const byPackage = new Map<string, Summary>();
      for (const r of rows) {
        const key = r.package_name || "(unnamed)";
        let summary = byPackage.get(key);
        if (!summary) {
          summary = {
            package_name: key,
            total_visits: 0,
            completed: 0,
            cancelled: 0,
            remaining: 0,
            first_date: null,
            last_date: null,
            earned_cents: 0,
            pending_cents: 0,
          };
          byPackage.set(key, summary);
        }
        const jv = visitsByJob.get(r.id);
        const jobTotal = r.total_cents ?? 0;
        const total = jv?.total ?? 0;
        const completed = jv?.completed ?? 0;
        const cancelled = jv?.cancelled ?? 0;
        // Cancelled visits are never delivered, so the even split of the job
        // total is over the deliverable (non-cancelled) visits.
        const deliverable = total - cancelled;
        let earned = 0;
        if (completed > 0) {
          earned =
            jv?.completedCents != null
              ? jv.completedCents
              : deliverable > 0
                ? Math.round((jobTotal * completed) / deliverable)
                : 0;
        }
        summary.total_visits += total;
        summary.completed += completed;
        summary.cancelled += cancelled;
        summary.earned_cents += earned;
        summary.pending_cents += Math.max(jobTotal - earned, 0);

        const earliest = r.scheduled_date ?? jv?.min ?? null;
        const latest = jv?.max ?? r.scheduled_date ?? null;
        if (earliest && (!summary.first_date || earliest < summary.first_date)) {
          summary.first_date = earliest;
        }
        if (latest && (!summary.last_date || latest > summary.last_date)) {
          summary.last_date = latest;
        }
      }

      const resultRows = [...byPackage.values()]
        .map((s) => ({ ...s, remaining: Math.max(s.total_visits - s.completed - s.cancelled, 0) }))
        .sort((a, b) => a.package_name.localeCompare(b.package_name));

      return buildResult(
        [
          col("package_name", "Package"),
          col("total_visits", "Total Visits", "number", false),
          col("completed", "Completed", "number", false),
          col("cancelled", "Cancelled", "number", false),
          col("remaining", "Remaining", "number", false),
          col("first_date", "First Visit", "date"),
          col("last_date", "Last Visit", "date"),
          col("earned_cents", "Earned", "money"),
          col("pending_cents", "Pending", "money"),
        ],
        resultRows
      );
    },
  },
  {
    key: "skipped-visits",
    section: "service",
    name: "Skipped Visits Report",
    description: "Shows visits that were skipped in any defined time frame, with the reason.",
    filters: [dateRangeFilterDef("Scheduled Between", "this_month")],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "scheduled_date",
        "client_name",
        "service_names",
        "crew_name",
        "skip_reason",
        "budgeted_hours",
        "revenue_cents",
      ],
      filters: [
        { column: "status", op: "eq", value: "skipped" },
        ...dateRangeFilters("scheduled_date", params, { preset: "this_month" }),
      ],
      groupBy: [],
      aggregates: [],
      sortColumn: "scheduled_date",
      sortDir: "desc",
    }),
  },
];
