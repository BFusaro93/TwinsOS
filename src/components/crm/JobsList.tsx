"use client";

import { useState } from "react";
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

const today = new Date().toISOString().slice(0, 10);
const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

export function JobsList() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"active" | "completed">("active");
  const [typeFilter, setTypeFilter] = useState("all");
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(in30);
  const [newJobOpen, setNewJobOpen] = useState(false);

  const { data: jobs = [], isLoading } = useJobsList({
    status:     viewMode === "completed" ? "completed" : undefined,
    activeOnly: viewMode === "active",
    jobType:    typeFilter !== "all" ? typeFilter : undefined,
    fromDate:   viewMode === "active" ? (fromDate || undefined) : undefined,
    toDate:     viewMode === "active" ? (toDate   || undefined) : undefined,
  });

  const filteredJobs = search
    ? jobs.filter(
        (j) =>
          (j.clientName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (j.crewName ?? "").toLowerCase().includes(search.toLowerCase()) ||
          (j.services ?? []).some((s) =>
            s.serviceName.toLowerCase().includes(search.toLowerCase())
          )
      )
    : jobs;

  // group by date — completed view uses updatedAt so jobs without scheduledDate still sort sensibly
  const grouped = filteredJobs.reduce<Record<string, CRMJob[]>>((acc, job) => {
    let key: string;
    if (viewMode === "completed") {
      key = job.updatedAt ? job.updatedAt.slice(0, 10) : (job.scheduledDate ?? "Unknown");
    } else {
      key = job.scheduledDate ?? "Unscheduled";
    }
    if (!acc[key]) acc[key] = [];
    acc[key].push(job);
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
    total:      filteredJobs.length,
    scheduled:  filteredJobs.filter((j) => j.status === "scheduled").length,
    inProgress: filteredJobs.filter((j) => j.status === "in_progress").length,
    completed:  filteredJobs.filter((j) => j.status === "completed").length,
    revenue:    filteredJobs.reduce((s, j) => s + (j.rateCents ?? 0), 0),
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
        <div className="flex rounded-md border overflow-hidden text-sm shrink-0">
          {(["active", "completed"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "px-3 py-1.5 capitalize transition-colors",
                viewMode === mode
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {mode === "active" ? "Active" : "Completed"}
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

      {dateKeys.map((dateKey) => (
        <div key={dateKey} className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {dateKey === "Unscheduled"
                ? "Unscheduled"
                : new Date(dateKey + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
            </p>
            <span className="text-xs text-slate-400">({grouped[dateKey].length})</span>
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm">
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
              <tbody>
                {grouped[dateKey].map((job) => (
                  <JobRow key={job.id} job={job} onClick={() => router.push(`/crm/scheduling/jobs/${job.id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <NewJobDialog
        open={newJobOpen}
        onOpenChange={setNewJobOpen}
      />
    </div>
  );
}

function JobRow({ job, onClick }: { job: CRMJob; onClick: () => void }) {
  const serviceNames = (job.services ?? []).map((s) => s.serviceName).filter(Boolean).join(", ");

  return (
    <tr className="border-b last:border-0 hover:bg-slate-50 transition-colors cursor-pointer" onClick={onClick}>
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{job.clientName ?? "—"}</p>
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
        {job.crewName ?? <span className="text-slate-400 italic">Unassigned</span>}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700 text-sm">
        {job.rateCents != null ? formatCurrency(job.rateCents) : "—"}
      </td>
      <td className="px-4 py-3 text-center">
        <Badge className={cn("text-[10px]", STATUS_COLOR[job.status] ?? "bg-slate-100 text-slate-500")}>
          {STATUS_LABEL[job.status] ?? job.status}
        </Badge>
      </td>
      <td className="px-4 py-3 text-center">
        <ChevronRight className="h-4 w-4 text-slate-300" />
      </td>
    </tr>
  );
}
