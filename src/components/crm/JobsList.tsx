"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useJobsList } from "@/lib/hooks/use-crm-jobs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, cn } from "@/lib/utils";
import { Search, Calendar, ChevronRight, Plus } from "lucide-react";
import { NewJobDialog } from "@/components/crm/jobs/NewJobDialog";
import type { CRMJob } from "@/types/crm-jobs";

// One row per JOB, not per visit. Recurring/package jobs can have dozens of
// generated visits — showing one row per visit made the same job appear to
// be in "Active" and "Completed" at once (and inflated the revenue stat,
// since job.rateCents got summed once per visit row). Instead, roll a job's
// visits up to a single representative occurrence: whichever visit is still
// pending (earliest upcoming), or if every visit is done, the job counts as
// completed. Jobs with no visits yet fall back to the job's own fields.
interface JobSummary {
  key: string;
  job: CRMJob;
  date: string | null;
  status: string;
  crewName: string | null;
  jobServiceId: string | null;
  visitCount: number;
  completedCount: number;
}

const TERMINAL_VISIT_STATUSES = new Set(["completed", "cancelled", "skipped"]);

function summarizeJob(job: CRMJob): JobSummary {
  const visits = job.visits ?? [];
  if (visits.length === 0) {
    return {
      key: job.id,
      job,
      date: job.scheduledDate,
      status: job.status,
      crewName: job.crewName ?? null,
      jobServiceId: null,
      visitCount: 0,
      completedCount: 0,
    };
  }
  const sorted = [...visits].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
  const pending = sorted.filter((v) => !TERMINAL_VISIT_STATUSES.has(v.status));
  const completedCount = sorted.filter((v) => v.status === "completed").length;
  // Still something to do → show the next upcoming visit. Otherwise every
  // visit has reached a terminal state — the job is done, so it belongs in
  // Completed even if its very last visit was skipped/cancelled rather than
  // literally completed (nothing pending means there's nothing left to act on).
  const rep = pending[0] ?? sorted[sorted.length - 1];
  return {
    key: job.id,
    job,
    date: rep.scheduledDate,
    status: pending.length > 0 ? rep.status : "completed",
    crewName: rep.crewName ?? job.crewName ?? null,
    jobServiceId: rep.jobServiceId,
    visitCount: sorted.length,
    completedCount,
  };
}

// job.rateCents is a single shared value that predates per-service line items
// (or goes stale once a job has several services split across visits, e.g.
// Spring Clean-up + Mulch added together) — sum the services when there are
// any, falling back to the job-level rate only for jobs with none.
function jobRevenueCents(job: CRMJob): number {
  const serviceTotal = (job.services ?? []).reduce((s, sv) => s + (sv.rateCents ?? 0) * (sv.qty ?? 1), 0);
  return serviceTotal > 0 ? serviceTotal : (job.rateCents ?? 0);
}

const STATUS_COLOR: Record<string, string> = {
  scheduled:   "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-700",
  completed:   "bg-green-100 text-green-700",
  cancelled:   "bg-red-100 text-red-600",
  skipped:     "bg-slate-100 text-slate-500",
  hold:        "bg-orange-100 text-orange-700",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled:   "Scheduled",
  in_progress: "In Progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  skipped:     "Skipped",
  hold:        "On Hold",
};

const JOB_TYPE_LABEL: Record<string, string> = {
  one_time:     "One Time",
  recurring:    "Recurring",
  waiting_list: "Waiting List",
  package:      "Package",
  snow:         "Snow",
  project:      "Project",
};

// .toISOString() converts through UTC — for timezones ahead of UTC this
// shifts the date back a day, e.g. dropping "today" from the active view
// after evening local time. Format from local Y/M/D components instead.
function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const today = toLocalDateString(new Date());
const in30 = toLocalDateString(new Date(Date.now() + 30 * 86400_000));

export function JobsList() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "unscheduled" | "completed">("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(in30);
  const [newJobOpen, setNewJobOpen] = useState(false);

  // Status/date filtering happens client-side below, per-occurrence — a job's
  // own status/scheduled_date don't reflect its individual generated visits.
  const { data: jobs = [], isLoading } = useJobsList({
    jobType: typeFilter !== "all" ? typeFilter : undefined,
  });

  const summaries = useMemo(() => jobs.map(summarizeJob), [jobs]);

  const viewFiltered = summaries.filter((o) => {
    if (viewMode === "unscheduled") return o.date === null;
    if (viewMode === "completed") return o.status === "completed";
    // active
    if (o.date === null) return false;
    if (o.status === "completed" || o.status === "cancelled") return false;
    // An overdue job (its earliest still-pending visit is in the past —
    // nobody ever marked it completed/skipped) always shows regardless of
    // the From/To window, which defaults to today onward. Otherwise a stale
    // recurring job just silently disappears from the default Active view
    // instead of surfacing as needing attention.
    if (o.date >= today) {
      if (fromDate && o.date < fromDate) return false;
      if (toDate && o.date > toDate) return false;
    }
    return true;
  });

  const filtered = search
    ? viewFiltered.filter(
        (o) =>
          (o.job.clientName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (o.crewName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (o.job.services ?? []).some((s) =>
            s.serviceName.toLowerCase().includes(search.toLowerCase())
          )
      )
    : viewFiltered;

  // group by date — completed view uses the visit/job's updatedAt so rows without a date still sort sensibly
  const grouped = filtered.reduce<Record<string, JobSummary[]>>((acc, o) => {
    let key: string;
    if (viewMode === "completed") {
      key = o.date ?? (o.job.updatedAt ? o.job.updatedAt.slice(0, 10) : "Unknown");
    } else {
      key = o.date ?? "Unscheduled";
    }
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});

  const dateKeys = Object.keys(grouped).sort((a, b) => {
    if (a === "Unscheduled" || a === "Unknown") return 1;
    if (b === "Unscheduled" || b === "Unknown") return -1;
    // completed view: most recent first
    if (viewMode === "completed") return b.localeCompare(a);
    return a.localeCompare(b);
  });

  const stats = {
    total:      filtered.length,
    scheduled:  filtered.filter((o) => o.status === "scheduled").length,
    inProgress: filtered.filter((o) => o.status === "in_progress").length,
    completed:  filtered.filter((o) => o.status === "completed").length,
    revenue:    filtered.reduce((s, o) => s + jobRevenueCents(o.job), 0),
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Jobs"
        description="All scheduled and completed jobs"
        action={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setNewJobOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Job
            </Button>
            <Link href="/crm/scheduling/dispatch">
              <Button size="sm">
                <Calendar className="mr-1.5 h-4 w-4" />
                Dispatch Board
              </Button>
            </Link>
          </div>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Total Jobs",  value: stats.total,               color: "text-slate-900" },
          { label: "Scheduled",   value: stats.scheduled,           color: "text-blue-700" },
          { label: "In Progress", value: stats.inProgress,          color: "text-yellow-700" },
          { label: "Completed",   value: stats.completed,           color: "text-green-700" },
          { label: "Revenue",     value: formatCurrency(stats.revenue), color: "text-slate-900" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-white p-4 shadow-sm text-center">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{s.label}</p>
            <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Active / Completed toggle + filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* View mode tabs */}
        <div className="flex h-10 rounded-md border overflow-hidden text-sm shrink-0">
          {(["active", "unscheduled", "completed"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
                viewMode === mode
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {mode === "active" ? "Active" : mode === "unscheduled" ? "Unscheduled" : "Completed"}
            </button>
          ))}
        </div>

        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client, crew or service…"
            className="pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36 text-sm">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(JOB_TYPE_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {viewMode === "active" && (
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-36 text-sm"
            />
            <span>–</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-36 text-sm"
            />
          </div>
        )}
        {(typeFilter !== "all" || search) && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-slate-500"
            onClick={() => { setTypeFilter("all"); setSearch(""); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Jobs grouped by date */}
      {isLoading && (
        <div className="py-12 text-center text-slate-400 text-sm">Loading jobs…</div>
      )}

      {!isLoading && dateKeys.length === 0 && (
        <div className="py-12 text-center text-slate-400 text-sm">
          No jobs found for the selected filters.
        </div>
      )}

      {dateKeys.length > 0 && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[26%]" />
              <col className="w-[26%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
              <col className="w-[8%]" />
              <col className="w-8" />
            </colgroup>
            <thead>
              <tr className="border-b bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left">Client</th>
                <th className="px-4 py-2.5 text-left">Services</th>
                <th className="px-4 py-2.5 text-left">Type</th>
                <th className="px-4 py-2.5 text-left">Crew</th>
                <th className="px-4 py-2.5 text-right">Revenue</th>
                <th className="px-4 py-2.5 text-center">Status</th>
                <th className="px-4 py-2.5 w-8" />
              </tr>
            </thead>
            {dateKeys.map((dateKey) => (
              <tbody key={dateKey}>
                <tr className="bg-slate-50/60">
                  <td colSpan={7} className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {dateKey === "Unscheduled"
                      ? "Unscheduled"
                      : new Date(dateKey + "T00:00:00").toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                    <span className="ml-2 normal-case text-slate-400">({grouped[dateKey].length})</span>
                  </td>
                </tr>
                {grouped[dateKey].map((o) => (
                  <JobRow key={o.key} occurrence={o} onClick={() => router.push(`/crm/scheduling/jobs/${o.job.id}`)} />
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
      <NewJobDialog
        open={newJobOpen}
        onOpenChange={setNewJobOpen}
      />
    </div>
  );
}

function JobRow({ occurrence, onClick }: { occurrence: JobSummary; onClick: () => void }) {
  const { job, status, crewName, jobServiceId, visitCount, completedCount } = occurrence;
  // Package jobs carry every step (e.g. all 5 Fert applications) on job.services,
  // but this occurrence is only for the ONE step its visit is linked to — show
  // just that, not every step on the whole package (same fix as Waiting List
  // and the Dispatch Board).
  const linkedService = jobServiceId ? (job.services ?? []).find((s) => s.id === jobServiceId) : null;
  const serviceNames = linkedService
    ? linkedService.serviceName
    : (job.services ?? []).map((s) => s.serviceName).filter(Boolean).join(", ");

  return (
    <tr className="border-b last:border-0 hover:bg-slate-50 transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Link href={`/crm/clients/${job.clientId}`} className="font-medium text-brand-600 hover:underline">
          {job.clientName ?? "—"}
        </Link>
        {job.serviceAddress && (
          <p className="text-xs text-slate-400 mt-0.5">{job.serviceAddress}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <p className="text-slate-700 text-xs max-w-xs truncate">
          {serviceNames || <span className="text-slate-400 italic">No services</span>}
        </p>
      </td>
      <td className="px-4 py-3 text-slate-500 text-xs">
        {JOB_TYPE_LABEL[job.jobType] ?? job.jobType}
      </td>
      <td className="px-4 py-3 text-slate-600 text-xs">
        {crewName ?? <span className="text-slate-400 italic">Unassigned</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700 text-sm">
        {formatCurrency(jobRevenueCents(job))}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge variant="outline" className={cn("text-[10px] border-transparent", STATUS_COLOR[status] ?? "bg-slate-100 text-slate-500")}>
          {STATUS_LABEL[status] ?? status}
        </Badge>
        {visitCount > 1 && (
          <p className="mt-0.5 text-[10px] text-slate-400">{completedCount}/{visitCount} visits</p>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </td>
    </tr>
  );
}
