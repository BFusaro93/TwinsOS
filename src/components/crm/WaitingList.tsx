"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useWaitingListJobs,
  useCRMCrews,
  useCreateVisit,
} from "@/lib/hooks/use-crm-jobs";
import { JobDetailSheet } from "@/components/crm/jobs/JobDetailSheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { ColumnChooser } from "@/components/shared/ColumnChooser";
import type { ColumnDef } from "@/components/shared/ColumnChooser";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewJobDialog } from "@/components/crm/jobs/NewJobDialog";
import { formatCurrency, cn } from "@/lib/utils";
import { Plus, ListOrdered, ChevronDown, RotateCcw, Search, Send, X } from "lucide-react";
import { toast } from "sonner";
import type { CRMJob, CRMJobService } from "@/types/crm-jobs";

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

// ── column + filter config ──────────────────────────────────────────────────

const WAITING_LIST_COLUMNS: ColumnDef[] = [
  { key: "client", label: "Client", locked: true },
  { key: "service", label: "Service" },
  { key: "dateRange", label: "Date Range" },
  { key: "city", label: "City" },
  { key: "zip", label: "Zip" },
  { key: "crew", label: "Crew" },
  { key: "rate", label: "Rate" },
];

type ColFilterKey = "client" | "service" | "city" | "zip" | "crew";

const COL_FILTERS: { key: ColFilterKey; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "service", label: "Service" },
  { key: "city", label: "City" },
  { key: "zip", label: "Zip" },
  { key: "crew", label: "Crew" },
];

// ── dispatch dialog ──────────────────────────────────────────────────────────

interface DispatchJobsDialogProps {
  jobs: CRMJob[];
  /** When scheduling a single visit within a package job, rather than the whole job. */
  service?: CRMJobService | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

function DispatchJobsDialog({ jobs, service, onOpenChange, onDone }: DispatchJobsDialogProps) {
  const { data: crews } = useCRMCrews();
  const createVisit = useCreateVisit();
  const [date, setDate] = useState(() => service?.startDate || toLocalDateString(new Date()));
  const [crewId, setCrewId] = useState("");

  async function handleDispatch() {
    if (!date) return;
    await Promise.all(
      jobs.map((job) =>
        createVisit.mutateAsync({
          jobId: job.id,
          clientId: job.clientId,
          scheduledDate: date,
          crewId: crewId || null,
          jobServiceId: service?.id ?? null,
          jobType: job.jobType,
        })
      )
    );
    toast.success(
      service
        ? `${service.serviceName} dispatched for ${date}`
        : `${jobs.length} job${jobs.length > 1 ? "s" : ""} dispatched for ${date}`
    );
    onDone();
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {service ? `Dispatch — ${service.serviceName}` : `Dispatch ${jobs.length} Job${jobs.length > 1 ? "s" : ""}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Crew</Label>
            <Select value={crewId || "unassigned"} onValueChange={(v) => setCrewId(v === "unassigned" ? "" : v)}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select crew…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(crews ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleDispatch} disabled={!date || createVisit.isPending}>
            {createVisit.isPending ? "Dispatching…" : "Dispatch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── row ──────────────────────────────────────────────────────────────────────

function WaitingJobRow({
  job,
  service,
  visibleKeys,
  selected,
  onToggle,
  onSchedule,
  onOpenJob,
}: {
  job: CRMJob;
  /** When set, this row represents one visit within a package job rather than the whole job. */
  service?: CRMJobService | null;
  visibleKeys: string[];
  selected: boolean;
  onToggle: () => void;
  onSchedule: () => void;
  onOpenJob: () => void;
}) {
  const serviceName = service
    ? service.serviceName
    : job.services && job.services.length > 0
      ? job.services.map((s) => s.serviceName).join(", ")
      : "—";
  const serviceTotal = (job.services ?? []).reduce(
    (sum, s) => sum + (s.rateCents ?? 0) * (s.qty ?? 1),
    0
  );
  const effectiveRate = service
    ? service.rateCents ?? null
    : job.rateCents ?? (serviceTotal > 0 ? serviceTotal : null);
  const isVisible = (key: string) => visibleKeys.includes(key);

  return (
    <tr
      className={cn("cursor-pointer border-b border-slate-100 text-sm hover:bg-slate-50", selected && "bg-brand-50")}
      onClick={onOpenJob}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="rounded border-slate-300 accent-brand-500"
        />
      </td>
      {isVisible("client") && (
        <td className="min-w-[200px] px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <Link href={`/crm/clients/${job.clientId}`} className="font-medium text-brand-600 hover:underline">
            {job.clientName ?? "—"}
          </Link>
          {job.serviceAddress && (
            <p className="text-xs text-slate-400">{job.serviceAddress}</p>
          )}
        </td>
      )}
      {isVisible("service") && (
        <td className="min-w-[180px] px-4 py-3 text-slate-700">{serviceName}</td>
      )}
      {isVisible("dateRange") && service && (
        <td className="px-4 py-3">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {formatDateRange(service.startDate, service.completeByDate)}
          </span>
        </td>
      )}
      {isVisible("dateRange") && !service && (
        <td className="px-4 py-3">
          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {formatDateRange(job.waitingListStart, job.waitingListEnd)}
          </span>
        </td>
      )}
      {isVisible("city") && (
        <td className="px-4 py-3 text-slate-500">{job.serviceCity ?? "—"}</td>
      )}
      {isVisible("zip") && (
        <td className="px-4 py-3 text-xs text-slate-400">{job.serviceZip ?? "—"}</td>
      )}
      {isVisible("crew") && (
        <td className="px-4 py-3">
          {job.crewName ? (
            <Badge variant="secondary" className="text-xs">
              {job.crewName}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">Unassigned</span>
          )}
        </td>
      )}
      {isVisible("rate") && (
        <td className="px-4 py-3 text-right font-medium text-slate-700">
          {effectiveRate != null ? formatCurrency(effectiveRate) : "—"}
        </td>
      )}
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onSchedule}>
          Schedule
        </Button>
      </td>
    </tr>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────

export function WaitingList() {
  const today = toLocalDateString(new Date());
  const thirtyOut = toLocalDateString(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  );

  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(thirtyOut);
  const [search, setSearch] = useState("");
  const [activeColFilter, setActiveColFilter] = useState<ColFilterKey | null>(null);
  const [colFilterValue, setColFilterValue] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleKeys, setVisibleKeys] = useState<string[]>(
    WAITING_LIST_COLUMNS.map((c) => c.key)
  );
  const [dispatchJobs, setDispatchJobs] = useState<CRMJob[] | null>(null);
  const [dispatchService, setDispatchService] = useState<{ job: CRMJob; service: CRMJobService } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data: jobs, isLoading, refetch } = useWaitingListJobs(startDate, endDate);
  const all = jobs ?? [];

  const filtered = useMemo(() => {
    let list = all;

    if (activeColFilter && colFilterValue.trim()) {
      const v = colFilterValue.toLowerCase();
      list = list.filter((job) => {
        switch (activeColFilter) {
          case "client":  return (job.clientName ?? "").toLowerCase().includes(v);
          case "service": return (job.services ?? []).some((s) => s.serviceName.toLowerCase().includes(v));
          case "city":    return (job.serviceCity ?? "").toLowerCase().includes(v);
          case "zip":     return (job.serviceZip ?? "").toLowerCase().includes(v);
          case "crew":    return (job.crewName ?? "").toLowerCase().includes(v);
          default:        return true;
        }
      });
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((job) =>
        (job.clientName ?? "").toLowerCase().includes(q) ||
        (job.services ?? []).some((s) => s.serviceName.toLowerCase().includes(q))
      );
    }

    return list;
  }, [all, activeColFilter, colFilterValue, search]);

  // Package jobs carry one crm_job_services row per visit, each with its own
  // date window — expand those into one row per visit so each can be scheduled
  // independently instead of the whole job going out on a single date.
  // Non-package jobs render unchanged.
  const visitRows = useMemo(() => {
    const rows: { key: string; job: CRMJob; service: CRMJobService | null }[] = [];
    for (const job of filtered) {
      if (job.jobType === "package" && (job.services?.length ?? 0) > 0) {
        for (const service of job.services!) {
          // The job-level waiting_list_start/end (used by the server-side date
          // filter) spans the whole package, so a job can pass the filter while
          // individual visits inside it fall outside the selected range — only
          // show visits whose own date window actually overlaps it.
          if (service.completeByDate && service.completeByDate < startDate) continue;
          if (service.startDate && service.startDate > endDate) continue;
          rows.push({ key: `${job.id}-${service.id}`, job, service });
        }
      } else {
        rows.push({ key: job.id, job, service: null });
      }
    }
    return rows;
  }, [filtered, startDate, endDate]);

  const allSelected = filtered.length > 0 && filtered.every((j) => selectedIds.has(j.id));
  const someSelected = selectedIds.size > 0;

  function toggleAll() {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((j) => j.id)));
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const colCount = visibleKeys.length + 2; // +1 checkbox, +1 schedule action

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Waiting List"
        description="Jobs queued for opportunistic scheduling"
        action={
          <Button size="sm" className="h-8 text-xs" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add to Waiting List
          </Button>
        }
      />

      <NewJobDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initialJobType="waiting_list"
        onCreated={() => refetch()}
      />

      {/* Date window */}
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
        <span className="ml-auto text-xs text-slate-400">
          {isLoading ? "…" : `${visitRows.length} jobs`}
        </span>
      </div>

      {/* Select a filter bar */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2">
        <span className="shrink-0 text-xs font-medium text-slate-500 mr-1">Select a Filter:</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {COL_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                if (activeColFilter === key) { setActiveColFilter(null); setColFilterValue(""); }
                else { setActiveColFilter(key); setColFilterValue(""); }
              }}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                activeColFilter === key
                  ? "bg-brand-100 text-brand-700 font-medium"
                  : "hover:bg-slate-100 text-slate-600"
              )}
            >
              {label}
            </button>
          ))}
          {activeColFilter && (
            <>
              <Input
                autoFocus
                value={colFilterValue}
                onChange={(e) => setColFilterValue(e.target.value)}
                placeholder={`Filter by ${COL_FILTERS.find((f) => f.key === activeColFilter)?.label}…`}
                className="ml-2 h-6 w-48 text-xs"
              />
              <button
                onClick={() => { setActiveColFilter(null); setColFilterValue(""); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Dark actions bar */}
      <div className="flex items-center justify-between bg-[#4a4a4a] px-4 py-2">
        <div className="flex items-center gap-2">
          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-7 bg-[#5a5a5a] border-[#6a6a6a] text-white hover:bg-[#6a6a6a] text-xs px-3"
              >
                Actions
                {someSelected && (
                  <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">{selectedIds.size}</span>
                )}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem
                disabled={!someSelected}
                onSelect={() => setDispatchJobs(filtered.filter((j) => selectedIds.has(j.id)))}
              >
                <Send className="mr-2 h-3.5 w-3.5" />
                Dispatch Selected…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh */}
          <button
            onClick={() => refetch()}
            className="flex h-7 w-7 items-center justify-center rounded border border-[#6a6a6a] bg-[#5a5a5a] text-white hover:bg-[#6a6a6a]"
            title="Refresh"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Search */}
          <div className="relative ml-2">
            <Search className="absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-7 w-44 pl-7 text-xs bg-white border-slate-200 focus-visible:ring-0"
            />
          </div>
        </div>

        <ColumnChooser
          columns={WAITING_LIST_COLUMNS}
          visibleKeys={visibleKeys}
          onVisibleKeysChange={setVisibleKeys}
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="rounded border-slate-300 accent-brand-500"
                />
              </th>
              {visibleKeys.includes("client") && <th className="min-w-[200px] px-4 py-3">Client</th>}
              {visibleKeys.includes("service") && <th className="min-w-[180px] px-4 py-3">Service</th>}
              {visibleKeys.includes("dateRange") && <th className="px-4 py-3">Date Range</th>}
              {visibleKeys.includes("city") && <th className="px-4 py-3">City</th>}
              {visibleKeys.includes("zip") && <th className="px-4 py-3">Zip</th>}
              {visibleKeys.includes("crew") && <th className="px-4 py-3">Crew</th>}
              {visibleKeys.includes("rate") && <th className="px-4 py-3 text-right">Rate</th>}
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : visitRows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-16 text-center text-sm text-slate-400">
                  {search || activeColFilter
                    ? "No jobs match your filters"
                    : "No jobs on the waiting list for this date range"}
                </td>
              </tr>
            ) : (
              visitRows.map(({ key, job, service }) => (
                <WaitingJobRow
                  key={key}
                  job={job}
                  service={service}
                  visibleKeys={visibleKeys}
                  selected={selectedIds.has(job.id)}
                  onToggle={() => toggleOne(job.id)}
                  onSchedule={() => service ? setDispatchService({ job, service }) : setDispatchJobs([job])}
                  onOpenJob={() => setSelectedJobId(job.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {dispatchJobs && (
        <DispatchJobsDialog
          jobs={dispatchJobs}
          onOpenChange={(open) => { if (!open) setDispatchJobs(null); }}
          onDone={() => { setSelectedIds(new Set()); refetch(); }}
        />
      )}

      {dispatchService && (
        <DispatchJobsDialog
          jobs={[dispatchService.job]}
          service={dispatchService.service}
          onOpenChange={(open) => { if (!open) setDispatchService(null); }}
          onDone={() => { refetch(); }}
        />
      )}

      <JobDetailSheet
        jobId={selectedJobId}
        onOpenChange={(open) => { if (!open) setSelectedJobId(null); }}
      />
    </div>
  );
}
