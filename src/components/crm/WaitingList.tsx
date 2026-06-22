"use client";

import { useState } from "react";
import { useWaitingListJobs } from "@/lib/hooks/use-crm-jobs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, ListOrdered } from "lucide-react";
import type { CRMJob } from "@/types/crm-jobs";

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateRange(start: string | null, end: string | null): string {
  const fmt = (s: string) =>
    new Date(s + "T12:00:00").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return "Any time";
}

function WaitingJobRow({ job }: { job: CRMJob }) {
  const serviceName =
    job.services && job.services.length > 0
      ? job.services.map((s) => s.serviceName).join(", ")
      : "—";

  return (
    <tr className="border-b border-slate-100 text-sm hover:bg-slate-50">
      <td className="min-w-[200px] px-4 py-3">
        <p className="font-medium text-slate-900">{job.clientName ?? "—"}</p>
        {job.serviceAddress && (
          <p className="text-xs text-slate-400">{job.serviceAddress}</p>
        )}
      </td>
      <td className="min-w-[180px] px-4 py-3 text-slate-700">{serviceName}</td>
      <td className="px-4 py-3">
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {formatDateRange(job.waitingListStart, job.waitingListEnd)}
        </span>
      </td>
      <td className="px-4 py-3 text-slate-500">{job.serviceCity ?? "—"}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{job.serviceZip ?? "—"}</td>
      <td className="px-4 py-3">
        {job.crewName ? (
          <Badge variant="secondary" className="text-xs">
            {job.crewName}
          </Badge>
        ) : (
          <span className="text-xs text-slate-400">Unassigned</span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-medium text-slate-700">
        {job.rateCents != null ? formatCurrency(job.rateCents) : "—"}
      </td>
      <td className="px-4 py-3">
        <Button variant="outline" size="sm" className="h-7 text-xs">
          Schedule
        </Button>
      </td>
    </tr>
  );
}

export function WaitingList() {
  const today = toLocalDateString(new Date());
  const thirtyOut = toLocalDateString(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(thirtyOut);

  const { data: jobs, isLoading } = useWaitingListJobs(startDate, endDate);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Waiting List"
        description="Jobs queued for opportunistic scheduling"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-2.5 shadow-sm">
        <ListOrdered className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">Date Window</span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => e.target.value && setStartDate(e.target.value)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => e.target.value && setEndDate(e.target.value)}
            className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-400">
            {isLoading ? "…" : `${(jobs ?? []).length} jobs`}
          </span>
          <Button size="sm" className="h-8 text-xs">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add to Waiting List
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="min-w-[200px] px-4 py-3">Client</th>
              <th className="min-w-[180px] px-4 py-3">Service</th>
              <th className="px-4 py-3">Date Range</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Zip</th>
              <th className="px-4 py-3">Crew</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : (jobs ?? []).length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center text-sm text-slate-400">
                  No jobs on the waiting list for this date range
                </td>
              </tr>
            ) : (
              (jobs ?? []).map((job) => (
                <WaitingJobRow key={job.id} job={job} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
