"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStormEvents,
  useCreateStormEvent,
  useUpdateStormEvent,
  useSnowRoutes,
  useSnowRouteStops,
  useSnowJobs,
  useStormEventVisits,
  useAddJobsToStormEvent,
} from "@/lib/hooks/use-snow-dispatch";
import { useCRMCrews, useUpdateVisit, useUpdateVisitStatus } from "@/lib/hooks/use-crm-jobs";
import { JobDetailSheet } from "@/components/crm/jobs/JobDetailSheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, cn } from "@/lib/utils";
import { billingGroupKey } from "@/lib/hooks/use-snow-invoicing";
import { useSnowRateTiersForJobs } from "@/lib/hooks/use-snow-rate-tiers";
import { computeGroupAmountCents, splitGroupAmountByVisit } from "@/lib/snow-billing";
import { toast } from "sonner";
import {
  Snowflake, Plus, Printer, Users, ChevronDown, RefreshCw,
  Calendar, Smartphone, CalendarCheck, CheckCircle2, XCircle, CornerDownRight,
  ListChecks, ThermometerSnowflake, Ruler, HelpCircle,
} from "lucide-react";
import type { CRMJobVisit, VisitStatus, StormEventStatus } from "@/types/crm-jobs";

// ── helpers ───────────────────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dayAbbrForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAY_ABBR[new Date(y, m - 1, d).getDay()];
}

// clients.priority is 'high' | 'normal' | 'low' — lower rank number sorts first (higher priority)
const PRIORITY_RANK: Record<string, number> = { high: 1, normal: 2, low: 3 };

const STATUS_CYCLE: VisitStatus[] = ["scheduled", "dispatched", "in_progress", "completed", "skipped"];

function StatusIcon({ status }: { status: VisitStatus }) {
  switch (status) {
    case "scheduled":   return <Calendar className="h-4 w-4 text-slate-400" />;
    case "dispatched":  return <Smartphone className="h-4 w-4 text-orange-400" />;
    case "in_progress": return <CalendarCheck className="h-4 w-4 text-yellow-500" />;
    case "completed":   return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "cancelled":   return <XCircle className="h-4 w-4 text-red-400" />;
    case "skipped":     return <CornerDownRight className="h-4 w-4 text-blue-400" />;
    default:            return <Calendar className="h-4 w-4 text-slate-300" />;
  }
}

function StatusCycleButton({ visit }: { visit: CRMJobVisit }) {
  const { can } = usePermissions();
  const canManage = can("snow_dispatch_manage");
  const { mutateAsync: updateStatus, isPending } = useUpdateVisitStatus();
  async function cycle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canManage) return;
    const i = STATUS_CYCLE.indexOf(visit.status);
    const next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    try {
      await updateStatus({ id: visit.id, status: next, jobId: visit.jobId, jobType: visit.job?.jobType });
    } catch {
      toast.error("Failed to update status");
    }
  }
  return (
    <button onClick={cycle} disabled={isPending || !canManage} title={visit.status} className={cn("flex items-center justify-center", isPending && "opacity-50")}>
      <StatusIcon status={visit.status} />
    </button>
  );
}

// ── new / edit storm event dialog ────────────────────────────────────────────

function StormEventDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { mutateAsync: createEvent, isPending } = useCreateStormEvent();
  const today = toLocalDateString(new Date());
  const [name, setName] = useState(`Snow Event ${today}`);
  const [eventDate, setEventDate] = useState(today);
  const [forecastDepth, setForecastDepth] = useState("");
  const [temperature, setTemperature] = useState("");

  async function handleCreate() {
    try {
      const event = await createEvent({
        name,
        eventDate,
        forecastDepthInches: forecastDepth ? parseFloat(forecastDepth) : null,
        temperature: temperature ? parseFloat(temperature) : null,
      });
      toast.success("Storm event created");
      onCreated(event.id);
      onOpenChange(false);
    } catch {
      toast.error("Failed to create storm event");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Storm Event</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Forecast Depth (in)</Label>
              <Input type="number" step="0.1" value={forecastDepth} onChange={(e) => setForecastDepth(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Temperature (°F)</Label>
              <Input type="number" value={temperature} onChange={(e) => setTemperature(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={!name || !eventDate || isPending}>
            {isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── add jobs to storm event dialog ───────────────────────────────────────────

function AddJobsDialog({
  open, onOpenChange, stormEventId, eventDate, forecastDepthInches, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  stormEventId: string;
  eventDate: string;
  forecastDepthInches: number | null;
  onDone: () => void;
}) {
  const { data: snowJobs = [], isLoading: jobsLoading } = useSnowJobs();
  const { data: routes = [] } = useSnowRoutes();
  const { data: crews = [] } = useCRMCrews();
  const addJobs = useAddJobsToStormEvent();

  const [routeId, setRouteId] = useState("");
  const { data: routeStops = [] } = useSnowRouteStops(routeId);
  const [date, setDate] = useState(eventDate);
  const [maxTriggerInches, setMaxTriggerInches] = useState(forecastDepthInches != null ? String(forecastDepthInches) : "");
  const [minPriority, setMinPriority] = useState("");
  const [defaultCrewId, setDefaultCrewId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  const candidateJobIds = routeId ? routeStops.map((s) => s.jobId) : snowJobs.map((j) => j.id);
  const candidates = useMemo(() => {
    const byId = new Map(snowJobs.map((j) => [j.id, j]));
    return candidateJobIds
      .map((id) => byId.get(id))
      .filter((j): j is NonNullable<typeof j> => !!j)
      .map((job) => {
        const overTrigger = maxTriggerInches !== "" && job.inchTrigger != null && job.inchTrigger > parseFloat(maxTriggerInches);
        const rank = PRIORITY_RANK[job.clientPriority ?? "low"] ?? 3;
        const underPriority = minPriority !== "" && rank > (PRIORITY_RANK[minPriority] ?? 3);
        const dayNotAuthorized = !!job.scheduleDays?.length && !job.scheduleDays.includes(dayAbbrForDate(date));
        return { job, excluded: overTrigger || underPriority || dayNotAuthorized };
      });
  }, [candidateJobIds, snowJobs, maxTriggerInches, minPriority, date]);

  if (open && !initialized && candidates.length > 0) {
    setSelectedIds(new Set(candidates.filter((c) => !c.excluded).map((c) => c.job.id)));
    setInitialized(true);
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    const jobs = candidates
      .filter((c) => selectedIds.has(c.job.id))
      .map((c) => ({ jobId: c.job.id, clientId: c.job.clientId, crewId: defaultCrewId || c.job.crewId || null }));
    if (jobs.length === 0) { toast.error("No jobs selected"); return; }
    try {
      await addJobs.mutateAsync({ stormEventId, date, jobs });
      toast.success(`Added ${jobs.length} job${jobs.length > 1 ? "s" : ""} to the storm event`);
      onDone();
      onOpenChange(false);
      setInitialized(false);
    } catch {
      toast.error("Failed to add jobs");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setInitialized(false); }}>
      <DialogContent className="max-w-2xl p-0 gap-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0 bg-[#4a4a4a] text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Add Jobs to Dispatch</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 border-b bg-slate-50 px-5 py-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-slate-500">Master Route (optional)</Label>
            <Select value={routeId || "adhoc"} onValueChange={(v) => setRouteId(v === "adhoc" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="adhoc">All Snow Jobs (no route)</SelectItem>
                {routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-slate-500">Dispatch Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[10px] uppercase text-slate-500">
              Max Trigger Inches
              <span
                title="This storm's expected/forecasted depth. Any snow job whose own trigger depth (the depth needed before their contract kicks in) is higher than this number is excluded below by default — this storm isn't deep enough to trigger their service. This value isn't saved; it only filters this dialog's candidate list."
                className="cursor-help"
              >
                <HelpCircle className="h-3 w-3 shrink-0 text-slate-400" />
              </span>
            </Label>
            <Input type="number" step="0.1" value={maxTriggerInches} onChange={(e) => setMaxTriggerInches(e.target.value)} placeholder="No limit" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-slate-500">Min Priority</Label>
            <Select value={minPriority || "any"} onValueChange={(v) => setMinPriority(v === "any" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any priority</SelectItem>
                <SelectItem value="high">High and higher</SelectItem>
                <SelectItem value="normal">Normal and higher</SelectItem>
                <SelectItem value="low">Low and higher</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 col-span-2">
            <Label className="text-[10px] uppercase text-slate-500">Default Crew (used when a job has none assigned)</Label>
            <Select value={defaultCrewId || "none"} onValueChange={(v) => setDefaultCrewId(v === "none" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {crews.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {jobsLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">No snow jobs found{routeId ? " on this route" : ""}.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Crew</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map(({ job, excluded }) => (
                  <tr
                    key={job.id}
                    className={cn("border-b cursor-pointer", excluded ? "bg-red-50 text-red-700" : "hover:bg-slate-50")}
                    onClick={() => toggle(job.id)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(job.id)} onCheckedChange={() => toggle(job.id)} className="h-3.5 w-3.5" />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {job.clientName ?? "—"}
                      {job.serviceAddress && <p className="text-[10px] text-slate-400 font-normal">{job.serviceAddress}</p>}
                    </td>
                    <td className="px-3 py-2">{job.inchTrigger != null ? `${job.inchTrigger}"` : "—"}</td>
                    <td className="px-3 py-2">{job.clientPriority ?? "—"}</td>
                    <td className="px-3 py-2">{job.crewName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between border-t bg-white px-5 py-3">
          <p className="text-xs text-slate-500">{selectedIds.size} of {candidates.length} selected</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" className="h-8 text-xs bg-brand-500 hover:bg-brand-600 text-white" onClick={handleAdd} disabled={addJobs.isPending}>
              {addJobs.isPending ? "Adding…" : `Add to Dispatch`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── crew assignment dialog (simplified drag) ─────────────────────────────────

function SnowCrewAssignDialog({
  open, onOpenChange, visits, crews,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visits: CRMJobVisit[];
  crews: { id: string; name: string }[];
}) {
  const { mutateAsync: updateVisit } = useUpdateVisit();
  const [dragVisitId, setDragVisitId] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const unassigned = visits.filter((v) => !v.crewId);

  async function reassign(visitId: string, crewId: string | null, jobId?: string) {
    try {
      await updateVisit({ id: visitId, updates: { crew_id: crewId }, jobId });
    } catch {
      toast.error("Failed to reassign");
    }
  }

  // Mirrors the main Dispatch Board's TeamAssignDialog "Dispatch Assigned"
  // action — this dialog previously had no equivalent, so a crew assigned
  // here via drag-and-drop had to be dispatched one row at a time from the
  // board's per-row status icon instead.
  async function dispatchAll() {
    setDispatching(true);
    try {
      const scheduled = visits.filter((v) => v.status === "scheduled" && v.crewId);
      await Promise.all(
        scheduled.map((v) =>
          updateVisit({
            id: v.id,
            updates: { status: "dispatched", dispatched_at: new Date().toISOString() },
            jobId: v.jobId,
          })
        )
      );
      toast.success(`${scheduled.length} visit${scheduled.length !== 1 ? "s" : ""} dispatched`);
      onOpenChange(false);
    } catch {
      toast.error("Dispatch failed");
    } finally {
      setDispatching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="shrink-0 bg-[#4a4a4a] text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Team Assignment</DialogTitle>
        </DialogHeader>
        <div className="flex flex-1 overflow-hidden">
          <div
            className="w-52 shrink-0 border-r bg-green-50 p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragVisitId) { const jId = visits.find((v) => v.id === dragVisitId)?.jobId; void reassign(dragVisitId, null, jId); setDragVisitId(null); } }}
          >
            <p className="text-[10px] font-semibold uppercase text-green-700 tracking-wide mb-3">Unassigned ({unassigned.length})</p>
            <div className="space-y-1.5">
              {unassigned.length === 0 ? (
                <p className="text-xs text-green-600 italic">All visits assigned</p>
              ) : unassigned.map((v) => (
                <div
                  key={v.id}
                  draggable
                  onDragStart={() => setDragVisitId(v.id)}
                  onDragEnd={() => setDragVisitId(null)}
                  className="rounded bg-white border border-green-200 px-2 py-1.5 cursor-grab active:cursor-grabbing"
                >
                  <p className="text-xs font-medium text-slate-700 truncate">{v.clientName ?? "—"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {crews.map((c) => (
                      <button key={c.id} onClick={() => reassign(v.id, c.id, v.jobId)} className="text-[9px] bg-slate-100 hover:bg-brand-100 hover:text-brand-700 text-slate-500 rounded px-1.5 py-0.5">
                        → {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-x-auto">
            <div className="flex h-full min-w-max">
              {crews.map((crew) => {
                const crewVisits = visits.filter((v) => v.crewId === crew.id);
                return (
                  <div
                    key={crew.id}
                    className="w-52 shrink-0 border-r p-4"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragVisitId) { const jId = visits.find((v) => v.id === dragVisitId)?.jobId; void reassign(dragVisitId, crew.id, jId); setDragVisitId(null); } }}
                  >
                    <p className="text-[10px] font-semibold uppercase text-slate-600 tracking-wide truncate mb-2">{crew.name} ({crewVisits.length})</p>
                    <div className="space-y-1.5 min-h-[40px]">
                      {crewVisits.map((v) => (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={() => setDragVisitId(v.id)}
                          onDragEnd={() => setDragVisitId(null)}
                          className="rounded bg-slate-50 border px-2 py-1.5 group relative cursor-grab active:cursor-grabbing"
                        >
                          <p className="text-xs font-medium text-slate-700 truncate">{v.clientName ?? "—"}</p>
                          <button onClick={() => reassign(v.id, null, v.jobId)} className="absolute top-1 right-1 flex md:hidden md:group-hover:flex text-[9px] text-slate-400 hover:text-red-500">✕</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {crews.length === 0 && (
                <div className="flex-1 flex items-center justify-center"><p className="text-sm text-slate-400">No crews configured</p></div>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-end gap-2 border-t bg-white px-5 py-3">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-brand-500 hover:bg-brand-600 text-white"
            disabled={dispatching || visits.filter((v) => v.status === "scheduled" && v.crewId).length === 0}
            onClick={() => void dispatchAll()}
          >
            {dispatching ? "Dispatching…" : "Dispatch Assigned"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── print route sheets dialog ────────────────────────────────────────────────

function SnowPrintDialog({
  open, onOpenChange, visits, crews, event,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visits: CRMJobVisit[];
  crews: { id: string; name: string }[];
  event: { name: string; eventDate: string } | null;
}) {
  const byCrew = crews.map((c) => ({ crew: c, visits: visits.filter((v) => v.crewId === c.id) })).filter((x) => x.visits.length > 0);
  const unassigned = visits.filter((v) => !v.crewId);

  function table(cv: CRMJobVisit[]) {
    return (
      <table className="w-full text-xs border-collapse mt-2">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1 text-left">#</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Client</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Address</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Weather Conditions</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Site Conditions</th>
            <th className="border border-slate-300 px-2 py-1 text-center">Full Plow</th>
            <th className="border border-slate-300 px-2 py-1 text-center">Salt (bags)</th>
          </tr>
        </thead>
        <tbody>
          {cv.map((v, i) => {
            const job = v.job;
            const addr = [job?.serviceAddress, job?.serviceCity].filter(Boolean).join(", ");
            return (
              <tr key={v.id} className="border-b border-slate-200">
                <td className="border border-slate-200 px-2 py-1 font-mono text-center">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-1 font-medium">{v.clientName ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1">{addr || "—"}</td>
                <td className="border border-slate-200 px-2 py-1 text-slate-400">☐ Snowing ☐ Freezing Rain ☐ Clear</td>
                <td className="border border-slate-200 px-2 py-1 text-slate-400">☐ Ice ☐ Slush ☐ Dry</td>
                <td className="border border-slate-200 px-2 py-1 text-center">☐</td>
                <td className="border border-slate-200 px-2 py-1 text-center"></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0 bg-[#4a4a4a] text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Print Route Sheets — {event?.name ?? ""} ({event?.eventDate ?? ""})</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          {byCrew.length === 0 && unassigned.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No visits to print.</p>}
          {byCrew.map(({ crew, visits: cv }) => (
            <div key={crew.id}>
              <div className="border-b-2 border-slate-800 pb-1 mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold">{crew.name}</h2>
                <span className="text-xs text-slate-500">{cv.length} stop{cv.length !== 1 ? "s" : ""}</span>
              </div>
              {table(cv)}
            </div>
          ))}
          {unassigned.length > 0 && (
            <div>
              <div className="border-b-2 border-amber-600 pb-1 mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-amber-700">Unassigned</h2>
                <span className="text-xs text-amber-600">{unassigned.length} stop{unassigned.length !== 1 ? "s" : ""}</span>
              </div>
              {table(unassigned)}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t bg-white px-5 py-3 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">Uses your browser&apos;s print dialog</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Close</Button>
            <Button size="sm" className="h-8 text-xs bg-brand-500 hover:bg-brand-600 text-white" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── close out dialog ──────────────────────────────────────────────────────────

function CloseOutDialog({
  open, onOpenChange, visits, onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visits: CRMJobVisit[];
  onDone: () => void;
}) {
  const { mutateAsync: updateVisit, isPending } = useUpdateVisit();
  const [depth, setDepth] = useState("");
  const [temp, setTemp] = useState("");
  const [assetType, setAssetType] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [materialQty, setMaterialQty] = useState("");
  const [materialUnitCost, setMaterialUnitCost] = useState("");
  const [actualHours, setActualHours] = useState("");
  // Hourly-billed snow jobs invoice actualHours × rate — this close-out flow
  // was the only path for these visits and never captured hours at all, so
  // hourly snow jobs always invoiced for $0. Only shown when relevant since
  // this dialog can close out a mixed batch of visits across job types.
  const hasHourlyJob = visits.some((v) => v.job?.invoiceType === "hourly");

  async function handleCloseOut() {
    try {
      const totalQty = materialQty ? parseFloat(materialQty) : 1;
      const unitCostCents = materialUnitCost ? Math.round(parseFloat(materialUnitCost) * 100) : 0;
      const totalHours = actualHours ? parseFloat(actualHours) : null;
      // The qty/hours fields are entered once for the whole batch (e.g. "10
      // bags of salt" / "2.5 hrs" for this close-out), not per stop — split
      // evenly across the selected visits so a multi-stop close-out doesn't
      // multiply material cost and actual hours by the visit count in Job
      // Costing/COGS and hourly-billed invoicing (both key off per-visit
      // values). A single-visit close-out is unaffected (divide by 1).
      const qty = totalQty / visits.length;
      const hoursPerVisit = totalHours !== null ? totalHours / visits.length : null;
      await Promise.all(visits.map((v) => updateVisit({
        id: v.id,
        jobId: v.jobId,
        jobType: v.job?.jobType,
        updates: {
          status: "completed",
          completed_at: new Date().toISOString(),
          snow_depth_inches: depth ? parseFloat(depth) : null,
          temperature: temp ? parseFloat(temp) : null,
          asset_type: assetType || null,
          materials_used: materialName
            ? [{ name: materialName, qty, rate_cents: unitCostCents }]
            : [],
          ...(hoursPerVisit !== null ? { actual_hours: hoursPerVisit } : {}),
        },
      })));
      // materials_used on crm_job_visits is display-only — it never feeds
      // Job Costing/COGS, which read crm_jobs.actual_material_cost_cents,
      // maintained only via the crm_job_materials table. Without this, every
      // snow storm's salt/material cost silently showed as $0 in those
      // reports no matter what was logged here.
      if (materialName && qty > 0) {
        await Promise.all(visits.map((v) =>
          fetch(`/api/crm/jobs/${v.jobId}/materials`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              description: materialName,
              qty,
              unitCostCents,
              visitId: v.id,
            }),
          }).catch(() => {
            // Non-fatal — the visit itself is already closed out; a failed
            // material-cost record shouldn't block the whole close-out.
          })
        ));
      }
      toast.success(`Closed out ${visits.length} visit${visits.length > 1 ? "s" : ""}`);
      onDone();
      onOpenChange(false);
    } catch {
      toast.error("Failed to close out visits");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Close Out {visits.length} Visit{visits.length > 1 ? "s" : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><Ruler className="h-3 w-3" /> Actual Depth (in)</Label>
              <Input type="number" step="0.1" value={depth} onChange={(e) => setDepth(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><ThermometerSnowflake className="h-3 w-3" /> Temp (°F)</Label>
              <Input type="number" value={temp} onChange={(e) => setTemp(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          {hasHourlyJob && (
            <div className="space-y-1.5">
              <Label>Actual Hours <span className="text-slate-400">(billed hourly)</span></Label>
              <Input type="number" step="0.25" value={actualHours} onChange={(e) => setActualHours(e.target.value)} placeholder="e.g. 2.5" className="h-9 text-sm" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Asset Type</Label>
            <Input value={assetType} onChange={(e) => setAssetType(e.target.value)} placeholder="e.g. Skid Steer" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <Label>Material Used</Label>
              <Input value={materialName} onChange={(e) => setMaterialName(e.target.value)} placeholder="e.g. Snow Salt" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Qty</Label>
              <Input type="number" value={materialQty} onChange={(e) => setMaterialQty(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Cost ($)</Label>
              <Input type="number" step="0.01" value={materialUnitCost} onChange={(e) => setMaterialUnitCost(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleCloseOut} disabled={isPending}>{isPending ? "Closing Out…" : "Close Out"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── main board ────────────────────────────────────────────────────────────────

const STATUS_PILL: Record<StormEventStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  working: "bg-orange-100 text-orange-700",
  complete: "bg-green-100 text-green-700",
};

export function SnowDispatchBoard() {
  const { can, isLoading: permissionsLoading } = usePermissions();
  const canManage = can("snow_dispatch_manage");
  const { data: events = [], isLoading: eventsLoading, refetch: refetchEvents } = useStormEvents();
  const { data: crews = [] } = useCRMCrews();
  const { mutateAsync: updateStormEvent } = useUpdateStormEvent();
  const qc = useQueryClient();

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [addJobsOpen, setAddJobsOpen] = useState(false);
  const [crewAssignOpen, setCrewAssignOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [closeOutIds, setCloseOutIds] = useState<Set<string> | null>(null);
  const [selectedVisitIds, setSelectedVisitIds] = useState<Set<string>>(new Set());
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const activeEvent = events.find((e) => e.id === selectedEventId) ?? events[0] ?? null;
  const effectiveEventId = activeEvent?.id ?? "";

  const { data: visits = [], isLoading: visitsLoading, refetch: refetchVisits } = useStormEventVisits(effectiveEventId);

  function toggleSelect(id: string) {
    setSelectedVisitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function advanceStatus(next: StormEventStatus) {
    if (!activeEvent) return;
    try {
      await updateStormEvent({ id: activeEvent.id, patch: { dispatch_status: next } });
      toast.success(`Storm event marked ${next}`);
    } catch {
      toast.error("Failed to update status");
    }
  }

  // Preview amounts use the same per-invoice-type math (per_event,
  // per_event_per_inch w/ rate tiers, per_push_per_inch, hourly) as the real
  // invoice generation in use-snow-invoicing.ts/SnowInvoicing.tsx — a naive
  // per-visit rateCents undercounted/overcounted every non-flat-rate job.
  const perEventPerInchJobIds = useMemo(
    () => visits.filter((v) => v.job?.invoiceType === "per_event_per_inch" && v.job?.id).map((v) => v.job!.id),
    [visits]
  );
  const { data: tiersByJobId } = useSnowRateTiersForJobs(perEventPerInchJobIds);

  const amountByVisitId = useMemo(() => {
    const byGroup = new Map<string, CRMJobVisit[]>();
    for (const v of visits) {
      const key = billingGroupKey(v);
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(v);
    }
    const result = new Map<string, number>();
    for (const groupVisits of byGroup.values()) {
      const total = computeGroupAmountCents(groupVisits, tiersByJobId);
      for (const [visitId, amount] of splitGroupAmountByVisit(groupVisits, total)) {
        result.set(visitId, amount);
      }
    }
    return result;
  }, [visits, tiersByJobId]);
  // amountByVisitId's per-group split always sums back to the exact group
  // total, so summing it here is equivalent to (and cheaper than) re-deriving
  // one representative visit's group amount per billingGroupKey.
  const totalAmt = useMemo(
    () => Array.from(amountByVisitId.values()).reduce((s, a) => s + a, 0),
    [amountByVisitId]
  );

  if (!permissionsLoading && !can("snow_dispatch_view")) {
    return (
      <EmptyState
        icon={Snowflake}
        title="No access"
        description="You don't have permission to view Snow Dispatch."
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader title="Snow Jobs" description="Storm-based scheduling and service entry" />

      {/* Storm event bar */}
      <div className="flex items-center gap-3 px-4 shrink-0">
        <Snowflake className="h-4 w-4 text-brand-500" />
        <Select value={effectiveEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="h-9 w-64 text-sm"><SelectValue placeholder="Select a storm event…" /></SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name} — {e.eventDate}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => setNewEventOpen(true)}>
            <Plus className="h-3.5 w-3.5" />New Storm Event
          </Button>
        )}

        {activeEvent && (
          <>
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn("h-7 rounded-full px-3 text-xs font-medium flex items-center gap-1", STATUS_PILL[activeEvent.dispatchStatus])}>
                    {activeEvent.dispatchStatus === "pending" ? "Pending" : activeEvent.dispatchStatus === "working" ? "Working" : "Complete"}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => advanceStatus("pending")}>Pending</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => advanceStatus("working")}>Working (Dispatch)</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => advanceStatus("complete")}>Complete</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className={cn("h-7 rounded-full px-3 text-xs font-medium flex items-center gap-1", STATUS_PILL[activeEvent.dispatchStatus])}>
                {activeEvent.dispatchStatus === "pending" ? "Pending" : activeEvent.dispatchStatus === "working" ? "Working" : "Complete"}
              </span>
            )}
            {activeEvent.forecastDepthInches != null && (
              <Badge variant="secondary" className="text-xs">{activeEvent.forecastDepthInches}&quot; forecast</Badge>
            )}
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => { void refetchEvents(); void refetchVisits(); }}
            className="h-9 w-9 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:text-slate-800"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {canManage && (
            <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => setCrewAssignOpen(true)} disabled={!activeEvent}>
              <Users className="h-3.5 w-3.5" />Team Assign
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5" onClick={() => setPrintOpen(true)} disabled={!activeEvent}>
            <Printer className="h-3.5 w-3.5" />Print
          </Button>
          {canManage && (
            <Button size="sm" className="h-9 text-xs gap-1.5 bg-brand-500 hover:bg-brand-600 text-white" onClick={() => setAddJobsOpen(true)} disabled={!activeEvent}>
              <Plus className="h-3.5 w-3.5" />Add Jobs
            </Button>
          )}
        </div>
      </div>

      {/* Selected-visit actions */}
      {selectedVisitIds.size > 0 && (
        <div className="mx-4 flex items-center gap-2 rounded border bg-brand-50 px-3 py-2 shrink-0">
          <ListChecks className="h-4 w-4 text-brand-600" />
          <span className="text-xs font-medium text-brand-700">{selectedVisitIds.size} selected</span>
          {canManage && (
            <Button size="sm" className="h-7 text-xs ml-2" onClick={() => setCloseOutIds(new Set(selectedVisitIds))}>
              Close Out…
            </Button>
          )}
          <button className="ml-auto text-xs text-slate-400 hover:text-slate-600" onClick={() => setSelectedVisitIds(new Set())}>Clear</button>
        </div>
      )}

      {/* Visit table */}
      <div className="flex-1 overflow-auto bg-white mx-4 rounded-lg border shadow-sm">
        {!activeEvent ? (
          <p className="py-20 text-center text-sm text-slate-400">
            {eventsLoading ? "Loading…" : "No storm events yet — create one to start dispatching."}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 border-b">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <th className="w-8 px-2 py-2.5" />
                <th className="w-8 px-2 py-2.5">St</th>
                <th className="min-w-[140px] px-2 py-2.5">Client</th>
                <th className="px-2 py-2.5">Address</th>
                <th className="px-2 py-2.5">Trigger</th>
                <th className="px-2 py-2.5">Crew</th>
                <th className="px-2 py-2.5 text-right">Depth</th>
                <th className="px-2 py-2.5 text-right">Temp</th>
                <th className="px-2 py-2.5 text-right">Amt</th>
              </tr>
            </thead>
            <tbody>
              {visitsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 9 }).map((__, j) => <td key={j} className="px-2 py-2.5"><Skeleton className="h-3 w-full" /></td>)}
                  </tr>
                ))
              ) : visits.length === 0 ? (
                <tr><td colSpan={9} className="py-20 text-center text-sm text-slate-400">No jobs dispatched to this storm event yet.</td></tr>
              ) : (
                <>
                  <tr className="bg-slate-100 text-[10px] font-semibold text-slate-700">
                    <td colSpan={8} className="px-2 py-1.5 text-right text-slate-500">Totals</td>
                    <td className="px-2 py-1.5 text-right">{totalAmt > 0 ? formatCurrency(totalAmt) : "—"}</td>
                  </tr>
                  {visits.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedJobId(v.jobId)}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selectedVisitIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} className="h-3.5 w-3.5" />
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><StatusCycleButton visit={v} /></td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/crm/clients/${v.clientId}`} className="font-medium text-brand-600 hover:underline">{v.clientName ?? "—"}</Link>
                      </td>
                      <td className="px-2 py-2 text-slate-500">{v.job?.serviceAddress ?? "—"}</td>
                      <td className="px-2 py-2 text-slate-500">{v.job?.inchTrigger != null ? `${v.job.inchTrigger}"` : "—"}</td>
                      <td className="px-2 py-2">
                        {v.crewName ? <Badge variant="secondary" className="text-[10px]">{v.crewName}</Badge> : <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-2 py-2 text-right text-slate-500">{v.snowDepthInches != null ? `${v.snowDepthInches}"` : "—"}</td>
                      <td className="px-2 py-2 text-right text-slate-500">{v.temperature != null ? `${v.temperature}°` : "—"}</td>
                      <td className="px-2 py-2 text-right font-medium text-slate-700">
                        {amountByVisitId.has(v.id) ? formatCurrency(amountByVisitId.get(v.id) ?? 0) : "—"}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}
      </div>

      <StormEventDialog
        open={newEventOpen}
        onOpenChange={setNewEventOpen}
        onCreated={(id) => { setSelectedEventId(id); void qc.invalidateQueries({ queryKey: ["storm-events"] }); }}
      />

      {activeEvent && (
        <>
          <AddJobsDialog
            open={addJobsOpen}
            onOpenChange={setAddJobsOpen}
            stormEventId={activeEvent.id}
            eventDate={activeEvent.eventDate}
            forecastDepthInches={activeEvent.forecastDepthInches}
            onDone={() => void refetchVisits()}
          />
          <SnowCrewAssignDialog open={crewAssignOpen} onOpenChange={setCrewAssignOpen} visits={visits} crews={crews} />
          <SnowPrintDialog open={printOpen} onOpenChange={setPrintOpen} visits={visits} crews={crews} event={activeEvent} />
        </>
      )}

      {closeOutIds && (
        <CloseOutDialog
          open
          onOpenChange={(o) => { if (!o) setCloseOutIds(null); }}
          visits={visits.filter((v) => closeOutIds.has(v.id))}
          onDone={() => { setSelectedVisitIds(new Set()); setCloseOutIds(null); void refetchVisits(); }}
        />
      )}

      <JobDetailSheet
        jobId={selectedJobId}
        onOpenChange={(open) => { if (!open) setSelectedJobId(null); }}
      />
    </div>
  );
}
