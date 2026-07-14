import type { PrebuiltReportDef } from "@/lib/reports/definition-types";
import {
  buildResult,
  col,
  containsFilter,
  dateRangeFilterDef,
  dateRangeFilters,
  eqFilter,
} from "@/lib/reports/helpers";

// ============================================================
// Service Reports section — pre-built reports.
// ============================================================

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
          { value: "in_progress", label: "In Progress" },
          { value: "completed", label: "Completed" },
          { value: "cancelled", label: "Cancelled" },
          { value: "skipped", label: "Skipped" },
        ],
      },
      { key: "crew", label: "Crew", type: "select", optionsSource: "crews" },
      { key: "zip", label: "Service Zip", type: "text", placeholder: "Any zip" },
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
        "actual_hours",
        "man_hours",
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
      "Visits still in Scheduled status on or before the cutoff — work waiting to be completed.",
    ],
    analysis: (params) => ({
      dataset: "rpt_job_visits",
      columns: [
        "scheduled_date",
        "client_name",
        "service_names",
        "crew_name",
        "budgeted_hours",
        "revenue_cents",
        "service_city",
      ],
      filters: [
        { column: "status", op: "eq", value: "scheduled" },
        {
          column: "scheduled_date",
          op: "lte",
          value: params.to || new Date().toISOString().slice(0, 10),
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
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .from("crm_job_services")
        .select("service_name, crm_jobs:job_id(client_id, status, deleted_at)")
        .limit(5000);
      if (error) throw new Error(error.message);

      interface Row {
        service_name: string | null;
        crm_jobs: {
          client_id: string | null;
          status: string | null;
          deleted_at: string | null;
        } | null;
      }
      const rows = (data ?? []) as unknown as Row[];

      const byService = new Map<string, Set<string>>();
      const allClients = new Set<string>();
      for (const r of rows) {
        const job = r.crm_jobs;
        if (!job || job.deleted_at !== null || job.status === "cancelled") continue;
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
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .from("crm_jobs")
        .select(
          "package_name, package_step, package_total_steps, is_complete, status, total_cents, scheduled_date"
        )
        .eq("job_type", "package")
        .is("deleted_at", null)
        .limit(5000);
      if (error) throw new Error(error.message);

      interface Row {
        package_name: string | null;
        package_step: number | null;
        package_total_steps: number | null;
        is_complete: boolean | null;
        status: string | null;
        total_cents: number | null;
        scheduled_date: string | null;
      }
      const rows = (data ?? []) as unknown as Row[];

      interface Summary {
        package_name: string;
        total_visits: number;
        completed: number;
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
            remaining: 0,
            first_date: null,
            last_date: null,
            earned_cents: 0,
            pending_cents: 0,
          };
          byPackage.set(key, summary);
        }
        summary.total_visits += 1;
        const isCompleted = Boolean(r.is_complete) || r.status === "completed";
        const cents = r.total_cents ?? 0;
        if (isCompleted) {
          summary.completed += 1;
          summary.earned_cents += cents;
        } else {
          summary.pending_cents += cents;
        }
        if (r.scheduled_date) {
          if (!summary.first_date || r.scheduled_date < summary.first_date) {
            summary.first_date = r.scheduled_date;
          }
          if (!summary.last_date || r.scheduled_date > summary.last_date) {
            summary.last_date = r.scheduled_date;
          }
        }
      }

      const resultRows = [...byPackage.values()]
        .map((s) => ({ ...s, remaining: s.total_visits - s.completed }))
        .sort((a, b) => a.package_name.localeCompare(b.package_name));

      return buildResult(
        [
          col("package_name", "Package"),
          col("total_visits", "Total Visits", "number", false),
          col("completed", "Completed", "number", false),
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
