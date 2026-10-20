"use client";

import { useEffect, useMemo, useState } from "react";
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
import { printSnowRouteSheets } from "@/lib/print";
import { JobDetailSheet } from "@/components/crm/jobs/JobDetailSheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { DispatchWeather } from "@/components/crm/dispatch/DispatchWeather";
import { SearchInput } from "@/components/shared/SearchInput";
import { DispatchMap, type DispatchMapStop } from "@/components/crm/dispatch/DispatchMap";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { FilterOptionRow } from "@/components/shared/FilterOptionRow";
import { usePersistedColumns } from "@/lib/hooks/use-ui-prefs";
import { formatCurrency, cn } from "@/lib/utils";
import { billingGroupKey } from "@/lib/hooks/use-snow-invoicing";
import { useSnowRateTiersForJobs } from "@/lib/hooks/use-snow-rate-tiers";
import { computeGroupAmountCents, splitGroupAmountByVisit } from "@/lib/snow-billing";
import { toast } from "sonner";
import {
  Snowflake, Plus, Printer, Users, ChevronDown, RefreshCw,
  Calendar, Smartphone, CalendarCheck, CheckCircle2, XCircle, CornerDownRight,
  ListChecks, ThermometerSnowflake, Ruler, HelpCircle, MapPin, ArrowUp, ArrowDown, Route as RouteIcon,
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

const SNOW_FILTER_TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "scheduled", label: "Scheduled" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "skipped", label: "Skipped" },
  { value: "cancelled", label: "Cancelled" },
];

const SNOW_COLUMNS: ColumnDef[] = [
  { key: "address", label: "Address" },
  { key: "city", label: "City", defaultHidden: true },
  { key: "zip", label: "Zip", defaultHidden: true },
  { key: "trigger", label: "Trigger" },
  { key: "crew", label: "Crew" },
  { key: "depth", label: "Depth" },
  { key: "temp", label: "Temp" },
  { key: "notes", label: "Notes to Crew" },
  { key: "amt", label: "Amt" },
];

const SNOW_OUTCOME_REASONS = ["No snow at this site", "Client cancelled", "Equipment down", "Site inaccessible", "Other"] as const;

/** Notes to crew for one stop — the visit's own note, else the job's — edited in place. */
function NotesToCrewCell({ visit, canEdit }: { visit: CRMJobVisit; canEdit: boolean }) {
  const { mutateAsync: updateVisit, isPending } = useUpdateVisit();
  const current = visit.notesToCrew ?? visit.job?.notesToCrew ?? "";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(current);
  useEffect(() => { if (open) setText(current); }, [open, current]);

  async function save() {
    try {
      await updateVisit({ id: visit.id, updates: { notes_to_crew: text.trim() || null }, jobId: visit.jobId });
      setOpen(false);
    } catch {
      toast.error("Failed to save note");
    }
  }

  const label = (
    <span className={cn("block max-w-[200px] truncate text-left", current ? "text-slate-700 dark:text-neutral-300" : "text-slate-300 dark:text-neutral-600")}>
      {current || (canEdit ? "Add note…" : "—")}
    </span>
  );
  if (!canEdit) return label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" title={current || "Add a note for the crew"}>{label}</button></PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2">
        <p className="text-xs font-medium">Notes to crew</p>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="text-sm" placeholder="Gate code, skip the back lot…" />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" size="sm" className="h-7 text-xs" onClick={save} disabled={isPending}>{isPending ? "Saving…" : "Save"}</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Reason prompt for skipping or cancelling stops — recorded on the visit and the client's timeline. */
function OutcomeDialog({
  state, onClose, onConfirm,
}: {
  state: { ids: string[]; status: "skipped" | "cancelled" } | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [preset, setPreset] = useState<string>(SNOW_OUTCOME_REASONS[0]);
  const [other, setOther] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (state) { setPreset(SNOW_OUTCOME_REASONS[0]); setOther(""); } }, [state]);
  const verb = state?.status === "cancelled" ? "Cancel" : "Skip";
  const reason = preset === "Other" ? other.trim() : preset;
  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{verb} {state?.ids.length} stop{state?.ids.length === 1 ? "" : "s"}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <Label>Reason</Label>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SNOW_OUTCOME_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          {preset === "Other" && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason" />}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Back</Button>
          <Button
            disabled={saving || !reason}
            onClick={async () => { setSaving(true); try { await onConfirm(reason); } finally { setSaving(false); } }}
          >
            {saving ? "Saving…" : `${verb} Stops`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_CYCLE: VisitStatus[] = ["scheduled", "dispatched", "in_progress", "completed", "skipped"];

function StatusIcon({ status }: { status: VisitStatus }) {
  switch (status) {
    case "scheduled":   return <Calendar className="h-4 w-4 text-slate-400 dark:text-neutral-500" />;
    case "dispatched":  return <Smartphone className="h-4 w-4 text-orange-400" />;
    case "in_progress": return <CalendarCheck className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />;
    case "completed":   return <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />;
    case "cancelled":   return <XCircle className="h-4 w-4 text-red-400" />;
    case "skipped":     return <CornerDownRight className="h-4 w-4 text-blue-400" />;
    default:            return <Calendar className="h-4 w-4 text-slate-300 dark:text-neutral-500" />;
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
    // A negative forecast made Add Jobs exclude every client (each trigger
    // depth is "above" it), so nobody could be dispatched by default.
    if (forecastDepth && parseFloat(forecastDepth) < 0) {
      toast.error("Forecast depth can't be negative");
      return;
    }
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
              <Input type="number" step="0.1" min={0} value={forecastDepth} onChange={(e) => setForecastDepth(e.target.value)} className="h-9 text-sm" />
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
      <DialogContent className="max-w-2xl p-0 gap-0 pt-10 sm:pt-10 max-h-[85vh] flex flex-col [&>button:last-child]:top-3">
        <DialogHeader className="shrink-0 bg-[#4a4a4a] text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Add Jobs to Dispatch</DialogTitle>
        </DialogHeader>

        <div className="shrink-0 border-b bg-slate-50 dark:bg-muted/40 px-5 py-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Master Route (optional)</Label>
            <Select value={routeId || "adhoc"} onValueChange={(v) => setRouteId(v === "adhoc" ? "" : v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="adhoc">All Snow Jobs (no route)</SelectItem>
                {routes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Dispatch Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
              Max Trigger Inches
              <span
                title="This storm's expected/forecasted depth. Any snow job whose own trigger depth (the depth needed before their contract kicks in) is higher than this number is excluded below by default — this storm isn't deep enough to trigger their service. This value isn't saved; it only filters this dialog's candidate list."
                className="cursor-help"
              >
                <HelpCircle className="h-3 w-3 shrink-0 text-slate-400 dark:text-neutral-500" />
              </span>
            </Label>
            <Input type="number" step="0.1" value={maxTriggerInches} onChange={(e) => setMaxTriggerInches(e.target.value)} placeholder="No limit" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground">Min Priority</Label>
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
            <Label className="text-[10px] uppercase text-muted-foreground">Default Crew (used when a job has none assigned)</Label>
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
            <p className="text-center text-sm text-slate-400 dark:text-neutral-500 py-12">No snow jobs found{routeId ? " on this route" : ""}.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-muted/40 border-b">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
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
                    className={cn("border-b cursor-pointer", excluded ? "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400" : "hover:bg-slate-50 dark:hover:bg-muted/40")}
                    onClick={() => toggle(job.id)}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selectedIds.has(job.id)} onCheckedChange={() => toggle(job.id)} className="h-3.5 w-3.5" />
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {job.clientName ?? "—"}
                      {job.serviceAddress && <p className="text-[10px] text-slate-400 dark:text-neutral-500 font-normal">{job.serviceAddress}</p>}
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

        <div className="shrink-0 flex items-center justify-between border-t bg-card px-5 py-3">
          <p className="text-xs text-muted-foreground">{selectedIds.size} of {candidates.length} selected</p>
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
  // Tap-to-place fallback for touch — iOS Safari never fires HTML5 drag events,
  // so the drag paths below are dead on a tablet. Mirrors the main Dispatch
  // Board's TeamAssignDialog; there are no crew-member chips on snow, only visits.
  const [heldVisitId, setHeldVisitId] = useState<string | null>(null);
  const unassigned = visits.filter((v) => !effectiveCrewIdOf(v));
  const heldVisit = heldVisitId ? visits.find((v) => v.id === heldVisitId) ?? null : null;

  useEffect(() => {
    if (!open) setHeldVisitId(null);
  }, [open]);

  async function reassign(visitId: string, crewId: string | null, jobId?: string) {
    try {
      // Unassign pins the visit to no crew (crew_unassigned) so other surfaces
      // don't fall back to the job's crew; an explicit crew clears the flag.
      await updateVisit({
        id: visitId,
        updates: crewId ? { crew_id: crewId, crew_unassigned: false } : { crew_id: null, crew_unassigned: true },
        jobId,
      });
    } catch {
      toast.error("Failed to reassign");
    }
  }

  /** Drop the held visit on a crew, or on null to send it back to the pool.
   *  Dropping it where it already is just cancels, which is also how tapping
   *  the held card a second time clears it. */
  async function place(crewId: string | null) {
    const v = heldVisit;
    setHeldVisitId(null);
    if (v && effectiveCrewIdOf(v) !== crewId) await reassign(v.id, crewId, v.jobId);
  }

  // Mirrors the main Dispatch Board's TeamAssignDialog "Dispatch Assigned"
  // action — this dialog previously had no equivalent, so a crew assigned
  // here via drag-and-drop had to be dispatched one row at a time from the
  // board's per-row status icon instead.
  async function dispatchAll() {
    setDispatching(true);
    try {
      const scheduled = visits.filter((v) => v.status === "scheduled" && effectiveCrewIdOf(v));
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
      <DialogContent
        className="max-w-6xl h-[85vh] p-0 gap-0 pt-10 sm:pt-10 max-h-[90vh] flex flex-col [&>button:last-child]:top-3"
        // Escape cancels a pick-up first; a second press closes the dialog.
        onEscapeKeyDown={(e) => {
          if (heldVisit) {
            e.preventDefault();
            setHeldVisitId(null);
          }
        }}
      >
        <DialogHeader className="shrink-0 bg-[#4a4a4a] text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Team Assignment</DialogTitle>
        </DialogHeader>
        {heldVisit ? (
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-900/30 px-5 py-2">
            <p className="text-xs text-brand-800 dark:text-brand-300">
              Moving <span className="font-semibold">{heldVisit.clientName ?? "Visit"}</span> — tap a
              crew, or Unassigned, to place it.
            </p>
            <button
              onClick={() => setHeldVisitId(null)}
              className="shrink-0 rounded border border-brand-300 dark:border-brand-700 bg-card px-2 py-1 text-[11px] font-medium text-brand-700 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-900/40"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="shrink-0 border-b bg-slate-50 dark:bg-muted/40 px-5 py-1.5 text-[11px] text-slate-400 dark:text-neutral-500">
            Drag a visit, or tap one to pick it up and tap where it should go.
          </p>
        )}
        <div className="flex flex-1 overflow-hidden">
          <div
            className={cn(
              "w-64 shrink-0 border-r bg-green-50 dark:bg-green-950/40 p-4",
              heldVisit && "cursor-pointer ring-2 ring-inset ring-brand-400"
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragVisitId) { const jId = visits.find((v) => v.id === dragVisitId)?.jobId; void reassign(dragVisitId, null, jId); setDragVisitId(null); } }}
            onClick={() => void place(null)}
          >
            <p className="text-[10px] font-semibold uppercase text-green-700 dark:text-green-400 tracking-wide mb-3">Unassigned ({unassigned.length})</p>
            <div className="space-y-1.5">
              {unassigned.length === 0 ? (
                <p className="text-xs text-green-600 dark:text-green-400 italic">
                  {heldVisit ? "Tap to unassign" : "All visits assigned"}
                </p>
              ) : unassigned.map((v) => (
                <div
                  key={v.id}
                  draggable
                  onDragStart={() => { setHeldVisitId(null); setDragVisitId(v.id); }}
                  onDragEnd={() => setDragVisitId(null)}
                  // With a visit already held, let the click through to the pool
                  // so it lands there; otherwise pick this card up.
                  onClick={(e) => {
                    if (heldVisit) return;
                    e.stopPropagation();
                    setHeldVisitId(v.id);
                  }}
                  className={cn(
                    "rounded bg-card border border-green-200 dark:border-green-800 px-2 py-1.5 cursor-grab active:cursor-grabbing",
                    heldVisitId === v.id && "ring-2 ring-brand-500 border-brand-300 dark:border-brand-700"
                  )}
                >
                  <p className="text-xs font-medium text-slate-700 dark:text-neutral-300 truncate">{v.clientName ?? "—"}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {crews.map((c) => (
                      <button key={c.id} onClick={(e) => { e.stopPropagation(); setHeldVisitId(null); void reassign(v.id, c.id, v.jobId); }} className="text-[9px] bg-muted hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-700 dark:hover:text-brand-400 text-muted-foreground rounded px-1.5 py-0.5">
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
                const crewVisits = visits.filter((v) => effectiveCrewIdOf(v) === crew.id);
                return (
                  <div
                    key={crew.id}
                    className={cn(
                      "w-64 shrink-0 border-r p-4",
                      heldVisit && "cursor-pointer ring-2 ring-inset ring-brand-400"
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { if (dragVisitId) { const jId = visits.find((v) => v.id === dragVisitId)?.jobId; void reassign(dragVisitId, crew.id, jId); setDragVisitId(null); } }}
                    onClick={() => void place(crew.id)}
                  >
                    <p className="text-[10px] font-semibold uppercase text-slate-600 dark:text-neutral-400 tracking-wide truncate mb-2">{crew.name} ({crewVisits.length})</p>
                    <div className="space-y-1.5 min-h-[40px]">
                      {crewVisits.map((v) => (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={() => { setHeldVisitId(null); setDragVisitId(v.id); }}
                          onDragEnd={() => setDragVisitId(null)}
                          onClick={(e) => {
                            if (heldVisit) return;
                            e.stopPropagation();
                            setHeldVisitId(v.id);
                          }}
                          className={cn(
                            // pr-7 keeps the client name clear of the ✕, which
                            // sits in the corner permanently on touch screens.
                            "rounded bg-slate-50 dark:bg-muted/40 border px-2 pr-7 py-1.5 group relative cursor-grab active:cursor-grabbing",
                            heldVisitId === v.id && "ring-2 ring-brand-500"
                          )}
                        >
                          <p className="text-xs font-medium text-slate-700 dark:text-neutral-300 truncate">{v.clientName ?? "—"}</p>
                          <button onClick={(e) => { e.stopPropagation(); setHeldVisitId(null); void reassign(v.id, null, v.jobId); }} className="absolute top-0 right-0 hidden group-hover:flex items-center justify-center h-6 w-6 text-[9px] text-slate-400 dark:text-neutral-500 hover:text-red-500 dark:hover:text-red-400" title="Unassign">✕</button>
                        </div>
                      ))}
                      {crewVisits.length === 0 && heldVisit && (
                        <p className="text-[10px] text-slate-300 dark:text-neutral-500 italic">Tap to place here</p>
                      )}
                    </div>
                  </div>
                );
              })}
              {crews.length === 0 && (
                <div className="flex-1 flex items-center justify-center"><p className="text-sm text-slate-400 dark:text-neutral-500">No crews configured</p></div>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-end gap-2 border-t bg-card px-5 py-3">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Close</Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-brand-500 hover:bg-brand-600 text-white"
            disabled={dispatching || visits.filter((v) => v.status === "scheduled" && effectiveCrewIdOf(v)).length === 0}
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
  const byCrew = crews.map((c) => ({ crew: c, visits: visits.filter((v) => effectiveCrewIdOf(v) === c.id) })).filter((x) => x.visits.length > 0);
  const unassigned = visits.filter((v) => !effectiveCrewIdOf(v));

  function table(cv: CRMJobVisit[]) {
    return (
      <table className="w-full text-xs border-collapse mt-2">
        <thead>
          <tr className="bg-muted">
            <th className="border border-slate-300 dark:border-neutral-700 px-2 py-1 text-left">#</th>
            <th className="border border-slate-300 dark:border-neutral-700 px-2 py-1 text-left">Client</th>
            <th className="border border-slate-300 dark:border-neutral-700 px-2 py-1 text-left">Address</th>
            <th className="border border-slate-300 dark:border-neutral-700 px-2 py-1 text-left">Weather Conditions</th>
            <th className="border border-slate-300 dark:border-neutral-700 px-2 py-1 text-left">Site Conditions</th>
            <th className="border border-slate-300 dark:border-neutral-700 px-2 py-1 text-center">Full Plow</th>
            <th className="border border-slate-300 dark:border-neutral-700 px-2 py-1 text-center">Salt (bags)</th>
          </tr>
        </thead>
        <tbody>
          {cv.map((v, i) => {
            const job = v.job;
            const addr = [job?.serviceAddress, job?.serviceCity].filter(Boolean).join(", ");
            return (
              <tr key={v.id} className="border-b border-border">
                <td className="border border-border px-2 py-1 font-mono text-center">{i + 1}</td>
                <td className="border border-border px-2 py-1 font-medium">{v.clientName ?? "—"}</td>
                <td className="border border-border px-2 py-1">{addr || "—"}</td>
                <td className="border border-border px-2 py-1 text-slate-400 dark:text-neutral-500">☐ Snowing ☐ Freezing Rain ☐ Clear</td>
                <td className="border border-border px-2 py-1 text-slate-400 dark:text-neutral-500">☐ Ice ☐ Slush ☐ Dry</td>
                <td className="border border-border px-2 py-1 text-center">☐</td>
                <td className="border border-border px-2 py-1 text-center"></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 pt-10 sm:pt-10 max-h-[90vh] flex flex-col [&>button:last-child]:top-3">
        <DialogHeader className="shrink-0 bg-[#4a4a4a] text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">Print Route Sheets — {event?.name ?? ""} ({event?.eventDate ?? ""})</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          {byCrew.length === 0 && unassigned.length === 0 && <p className="text-sm text-slate-400 dark:text-neutral-500 text-center py-8">No visits to print.</p>}
          {byCrew.map(({ crew, visits: cv }) => (
            <div key={crew.id}>
              <div className="border-b-2 border-slate-800 pb-1 mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold">{crew.name}</h2>
                <span className="text-xs text-muted-foreground">{cv.length} stop{cv.length !== 1 ? "s" : ""}</span>
              </div>
              {table(cv)}
            </div>
          ))}
          {unassigned.length > 0 && (
            <div>
              <div className="border-b-2 border-amber-600 pb-1 mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400">Unassigned</h2>
                <span className="text-xs text-amber-600 dark:text-amber-400">{unassigned.length} stop{unassigned.length !== 1 ? "s" : ""}</span>
              </div>
              {table(unassigned)}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t bg-card px-5 py-3 flex items-center justify-between">
          <p className="text-[11px] text-slate-400 dark:text-neutral-500">Opens your browser&apos;s print dialog in a new window</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Close</Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-brand-500 hover:bg-brand-600 text-white"
              onClick={() => printSnowRouteSheets(`${event?.name ?? ""} (${event?.eventDate ?? ""})`, crews, visits)}
            >
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
      // Idempotent: a visit already completed (a re-run after a partial
      // failure, or a double-click) is skipped entirely — re-running its
      // update would re-fire completion side-effects and re-posting its
      // material row would double the storm's material cost.
      const pending = visits.filter((v) => v.status !== "completed");
      if (pending.length === 0) {
        toast.info("These visits are already closed out");
        onDone();
        onOpenChange(false);
        return;
      }
      const totalQty = materialQty ? parseFloat(materialQty) : 1;
      const unitCostCents = materialUnitCost ? Math.round(parseFloat(materialUnitCost) * 100) : 0;
      const totalHours = actualHours ? parseFloat(actualHours) : null;
      // The qty/hours fields are entered once for the whole batch (e.g. "10
      // bags of salt" / "2.5 hrs" for this close-out), not per stop — split
      // evenly across the visits being closed so a multi-stop close-out doesn't
      // multiply material cost and actual hours by the visit count in Job
      // Costing/COGS and hourly-billed invoicing (both key off per-visit
      // values). A single-visit close-out is unaffected (divide by 1).
      const qty = totalQty / pending.length;
      // Hours only matter to hourly-billed jobs: splitting them across every visit
      // in a mixed batch under-billed the hourly clients (6h over 5 visits = 1.2h
      // each, with 3 non-hourly visits soaking up half of it).
      const hourlyPending = pending.filter((v) => v.job?.invoiceType === "hourly");
      const hoursPerVisit = totalHours !== null && hourlyPending.length > 0 ? totalHours / hourlyPending.length : null;
      // Completion fires per-client side effects (auto-invoice, review
      // requests…), so visits for the SAME client run one after another —
      // parallel completions race each other into duplicate invoices — while
      // different clients still run concurrently (same shape as bulk-complete).
      const byClient = new Map<string, CRMJobVisit[]>();
      for (const v of pending) {
        const key = v.clientId ?? v.id;
        byClient.set(key, [...(byClient.get(key) ?? []), v]);
      }
      await Promise.all([...byClient.values()].map(async (group) => {
        for (const v of group) {
          await updateVisit({
            id: v.id,
            jobId: v.jobId,
            jobType: v.job?.jobType,
            updates: {
              status: "completed",
              completed_at: new Date().toISOString(),
              snow_depth_inches: depth ? Math.max(0, parseFloat(depth)) : null,
              temperature: temp ? parseFloat(temp) : null,
              asset_type: assetType || null,
              materials_used: materialName
                ? [{ name: materialName, qty, rate_cents: unitCostCents }]
                : [],
              ...(hoursPerVisit !== null && v.job?.invoiceType === "hourly" ? { actual_hours: hoursPerVisit } : {}),
            },
          });
          // materials_used on crm_job_visits is display-only — it never feeds
          // Job Costing/COGS, which read crm_jobs.actual_material_cost_cents,
          // maintained only via the crm_job_materials table. Without this, every
          // snow storm's salt/material cost silently showed as $0 in those
          // reports no matter what was logged here.
          if (materialName && qty > 0) {
            await fetch(`/api/crm/jobs/${v.jobId}/materials`, {
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
            });
          }
        }
      }));
      toast.success(`Closed out ${pending.length} visit${pending.length > 1 ? "s" : ""}`);
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
              <Input type="number" step="0.1" min={0} value={depth} onChange={(e) => setDepth(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1"><ThermometerSnowflake className="h-3 w-3" /> Temp (°F)</Label>
              <Input type="number" value={temp} onChange={(e) => setTemp(e.target.value)} className="h-9 text-sm" />
            </div>
          </div>
          {hasHourlyJob && (
            <div className="space-y-1.5">
              <Label>Actual Hours <span className="text-slate-400 dark:text-neutral-500">(billed hourly)</span></Label>
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
  pending: "bg-muted text-slate-600 dark:text-neutral-400",
  working: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400",
  complete: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",
};

interface RouteResult {
  error?: string;
  orderedVisitIds?: string[];
  driveTimes?: { visitId: string; minutesToNext: number }[];
  shopOutMinutes?: number | null;
}

/** The visit's own crew, else its job's — same rule the main Dispatch Board uses. */
function effectiveCrewIdOf(v: CRMJobVisit): string | null {
  if (v.crewUnassigned) return null;
  return v.crewId ?? v.job?.crewId ?? null;
}

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
  const [search, setSearch] = useState("");
  const [crewFilters, setCrewFilters] = useState<string[]>([]); // crew ids, plus "none" for Unassigned
  const [statsOpen, setStatsOpen] = useState(false);
  const [outcomeDialog, setOutcomeDialog] = useState<{ ids: string[]; status: "skipped" | "cancelled" } | null>(null);
  const [visibleKeys, setVisibleKeys] = usePersistedColumns("snow_dispatch", SNOW_COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.key));
  const isVisible = (k: string) => visibleKeys.includes(k);
  const { mutateAsync: updateVisitStatus } = useUpdateVisitStatus();
  const [statusFilter, setStatusFilter] = useState("all");
  const [routeStrategy, setRouteStrategy] = useState<"furthest_first" | "nearest_first">("nearest_first");
  const [optimizing, setOptimizing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const { data: orgSettings } = useOrgSettings();
  // Minutes to ARRIVE at each stop (from the previous stop, or the shop for a crew's first stop).
  const [driveMins, setDriveMins] = useState<Map<string, { mins: number; fromShop: boolean }>>(new Map());
  const { mutateAsync: updateVisitMutation } = useUpdateVisit();

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
    // Client-side check first (fast feedback, matches the count of stops
    // already loaded for this storm event) — the DB trigger
    // (enforce_storm_event_completion_gate, see
    // 20260902160000_snow_storm_completion_gate.sql) is the authoritative
    // backstop in case this check is ever bypassed (stale visits list,
    // direct write, future code path).
    if (next === "complete") {
      const openVisits = visits.filter(
        (v) => v.status !== "completed" && v.status !== "skipped" && v.status !== "cancelled"
      );
      if (openVisits.length > 0) {
        toast.error(
          `${openVisits.length} stop${openVisits.length > 1 ? "s" : ""} still need to be completed or skipped before closing this storm event.`
        );
        return;
      }
    }
    try {
      await updateStormEvent({ id: activeEvent.id, patch: { dispatch_status: next } });
      toast.success(`Storm event marked ${next}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  // Preview amounts use the same per-invoice-type math (per_event,
  // per_event_per_inch w/ rate tiers, per_push_per_inch, hourly) as the real
  // invoice generation in use-snow-invoicing.ts/SnowInvoicing.tsx — a naive
  // per-visit rateCents undercounted/overcounted every non-flat-rate job.
  const perEventPerInchJobIds = useMemo(
    () => visits.filter((v) => (v.job?.invoiceType === "per_event_per_inch" || v.job?.invoiceType === "per_push_per_inch") && v.job?.id).map((v) => v.job!.id),
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

  const crewNameById = useMemo(() => new Map(crews.map((c) => [c.id, c.name])), [crews]);

  const filteredVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits.filter((v) => {
      const crewId = effectiveCrewIdOf(v);
      if (crewFilters.length > 0 && !crewFilters.includes(crewId ?? "none")) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (q) {
        const hay = [
          v.clientName, v.job?.serviceAddress, v.job?.serviceCity, v.job?.serviceZip, v.job?.notesToCrew,
          crewId ? crewNameById.get(crewId) : null,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visits, search, crewFilters, statusFilter, crewNameById]);

  // Stop number within the crew's route, following order_num.
  const stopNumberById = useMemo(() => {
    const counters = new Map<string, number>();
    const result = new Map<string, number>();
    for (const v of visits) {
      const key = effectiveCrewIdOf(v) ?? "none";
      const n = (counters.get(key) ?? 0) + 1;
      counters.set(key, n);
      result.set(v.id, n);
    }
    return result;
  }, [visits]);

  const filteredTotalAmt = useMemo(
    () => filteredVisits.reduce((s, v) => s + (amountByVisitId.get(v.id) ?? 0), 0),
    [filteredVisits, amountByVisitId]
  );

  function toggleCrewFilter(id: string) {
    setCrewFilters((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const crewStats = useMemo(() => {
    const map = new Map<string, { key: string; name: string; total: number; done: number; amount: number }>();
    for (const v of visits) {
      const crewId = effectiveCrewIdOf(v);
      const key = crewId ?? "none";
      if (!map.has(key)) map.set(key, { key, name: crewId ? crewNameById.get(crewId) ?? "Crew" : "Unassigned", total: 0, done: 0, amount: 0 });
      const row = map.get(key)!;
      row.total++;
      if (v.status === "completed") row.done++;
      row.amount += amountByVisitId.get(v.id) ?? 0;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [visits, crewNameById, amountByVisitId]);

  /** Dispatches the given visits, or — with null — every scheduled visit that has a crew. */
  async function dispatchVisits(ids: string[] | null) {
    const targets = visits.filter((v) => v.status === "scheduled" && effectiveCrewIdOf(v) && (ids ? ids.includes(v.id) : true));
    if (targets.length === 0) {
      toast.info(ids ? "Selected stops are already dispatched or have no crew." : "No scheduled stops with a crew to dispatch.");
      return;
    }
    try {
      await Promise.all(targets.map((v) => updateVisitMutation({
        id: v.id,
        updates: { status: "dispatched", dispatched_at: new Date().toISOString() },
        jobId: v.jobId,
      })));
      toast.success(`${targets.length} stop${targets.length !== 1 ? "s" : ""} dispatched`);
    } catch {
      toast.error("Dispatch failed");
    }
  }

  async function applyOutcome(reason: string) {
    if (!outcomeDialog) return;
    const { ids, status } = outcomeDialog;
    try {
      await Promise.all(ids.map((id) => {
        const v = visits.find((x) => x.id === id);
        return updateVisitStatus({ id, status, reason, jobId: v?.jobId, jobType: v?.job?.jobType });
      }));
      toast.success(`${ids.length} stop${ids.length !== 1 ? "s" : ""} ${status === "skipped" ? "skipped" : "cancelled"}`);
      setSelectedVisitIds(new Set());
      setOutcomeDialog(null);
    } catch {
      toast.error("Failed to update stops");
    }
  }

  /** Writes order_num for every visit whose position in `orderedIds` changed. */
  async function persistOrder(orderedIds: string[]) {
    const byId = new Map(visits.map((v) => [v.id, v]));
    const changes = orderedIds
      .map((id, i) => ({ id, i, v: byId.get(id) }))
      .filter((x) => x.v && x.v.orderNum !== x.i);
    await Promise.all(changes.map((x) => updateVisitMutation({ id: x.id, updates: { order_num: x.i }, jobId: x.v!.jobId })));
  }

  async function moveStop(v: CRMJobVisit, dir: -1 | 1) {
    const crewKey = effectiveCrewIdOf(v) ?? "none";
    const group = filteredVisits.filter((x) => (effectiveCrewIdOf(x) ?? "none") === crewKey);
    const idx = group.findIndex((x) => x.id === v.id);
    const neighbor = group[idx + dir];
    if (!neighbor) return;
    const ids = visits.map((x) => x.id);
    const a = ids.indexOf(v.id);
    const b = ids.indexOf(neighbor.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    setDriveMins(new Map());
    try { await persistOrder(ids); } catch { toast.error("Failed to reorder"); }
  }

  async function changeCrew(visitIds: string[], crewId: string | null) {
    try {
      await Promise.all(visitIds.map((id) => {
        const v = visits.find((x) => x.id === id);
        return updateVisitMutation({
          id,
          // Unassign pins the visit to no crew so it doesn't fall back to the job's crew.
          updates: crewId ? { crew_id: crewId, crew_unassigned: false } : { crew_id: null, crew_unassigned: true },
          jobId: v?.jobId,
        });
      }));
      setDriveMins(new Map());
    } catch {
      toast.error("Failed to change crew");
    }
  }

  async function optimizeRoutes() {
    // Selected stops if any, else everything currently shown. Each crew is routed on its own.
    const pool = selectedVisitIds.size > 0 ? visits.filter((v) => selectedVisitIds.has(v.id)) : filteredVisits;
    const byCrew = new Map<string, CRMJobVisit[]>();
    for (const v of pool) {
      const crewId = effectiveCrewIdOf(v);
      if (!crewId) continue;
      if (!byCrew.has(crewId)) byCrew.set(crewId, []);
      byCrew.get(crewId)!.push(v);
    }
    const routable = [...byCrew.entries()].filter(([, list]) => list.length >= 2);
    if (routable.length === 0) {
      toast.error("Each crew needs at least 2 stops with an address to optimize — assign crews first.");
      return;
    }
    setOptimizing(true);
    try {
      const results = await Promise.all(routable.map(async ([crewId, list]) => {
        try {
          const res = await fetch("/api/crm/route-optimize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitIds: list.map((v) => v.id), strategy: routeStrategy, crewId }),
          });
          const data = await res.json() as RouteResult;
          return res.ok ? { crewId, data } : { crewId, error: data.error ?? "Route optimization failed" };
        } catch {
          return { crewId, error: "Failed to reach route optimizer" };
        }
      }));
      const ok = results.filter((r): r is { crewId: string; data: RouteResult } => "data" in r);
      const failed = results.filter((r): r is { crewId: string; error: string } => "error" in r);
      if (ok.length === 0) { toast.error(failed[0]?.error ?? "Route optimization failed"); return; }

      // Splice each crew's new order back over the positions that crew already occupies.
      const queues = new Map<string, string[]>();
      for (const { crewId, data } of ok) {
        const ordered = data.orderedVisitIds ?? [];
        const placed = new Set(ordered);
        queues.set(crewId, [...ordered, ...(byCrew.get(crewId) ?? []).map((v) => v.id).filter((id) => !placed.has(id))]);
      }
      const members = new Map<string, Set<string>>(ok.map(({ crewId }) => [crewId, new Set((byCrew.get(crewId) ?? []).map((v) => v.id))]));
      const pointers = new Map<string, number>();
      const merged = visits.map((v) => {
        const crewId = effectiveCrewIdOf(v);
        if (!crewId || !members.get(crewId)?.has(v.id)) return v.id;
        const ptr = pointers.get(crewId) ?? 0;
        pointers.set(crewId, ptr + 1);
        return queues.get(crewId)![ptr] ?? v.id;
      });

      const dt = new Map<string, { mins: number; fromShop: boolean }>();
      for (const { data } of ok) {
        const ordered = data.orderedVisitIds ?? [];
        if (ordered[0] && data.shopOutMinutes != null) dt.set(ordered[0], { mins: data.shopOutMinutes, fromShop: true });
        (data.driveTimes ?? []).forEach((d, i) => {
          if (ordered[i + 1]) dt.set(ordered[i + 1], { mins: d.minutesToNext, fromShop: false });
        });
      }
      await persistOrder(merged);
      setDriveMins(dt);
      toast.success(`Routed ${ok.length} ${ok.length === 1 ? "crew" : "crews"} and saved the stop order.` + (failed.length ? ` ${failed.length} failed: ${failed[0].error}` : ""));
    } catch {
      toast.error("Failed to optimize routes");
    } finally {
      setOptimizing(false);
    }
  }

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

      {activeEvent && visits.length > 0 && (
        <DispatchWeather
          className="px-4 shrink-0"
          date={activeEvent.eventDate}
          jobs={visits.slice(0, 25).map((v) => ({ id: v.jobId, lat: v.job?.lat ?? null, lng: v.job?.lng ?? null }))}
        />
      )}

      {/* Storm event bar — wraps so the action group drops to its own line
          rather than running off the edge on a tablet. */}
      <div className="flex flex-wrap items-center gap-3 px-4 shrink-0">
        <Snowflake className="h-4 w-4 text-brand-500 dark:text-brand-400" />
        <Select value={effectiveEventId} onValueChange={setSelectedEventId}>
          <SelectTrigger className="h-9 max-lg:h-11 w-64 max-w-full text-sm"><SelectValue placeholder="Select a storm event…" /></SelectTrigger>
          <SelectContent>
            {events.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name} — {e.eventDate}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canManage && (
          <Button size="sm" variant="outline" className="h-9 max-lg:h-11 text-xs gap-1.5" onClick={() => setNewEventOpen(true)}>
            <Plus className="h-3.5 w-3.5" />New Storm Event
          </Button>
        )}

        {activeEvent && (
          <>
            {canManage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn("h-7 max-lg:h-9 rounded-full px-3 text-xs font-medium flex items-center gap-1", STATUS_PILL[activeEvent.dispatchStatus])}>
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
              <span className={cn("h-7 max-lg:h-9 rounded-full px-3 text-xs font-medium flex items-center gap-1", STATUS_PILL[activeEvent.dispatchStatus])}>
                {activeEvent.dispatchStatus === "pending" ? "Pending" : activeEvent.dispatchStatus === "working" ? "Working" : "Complete"}
              </span>
            )}
            {activeEvent.forecastDepthInches != null && (
              <Badge variant="secondary" className="text-xs">{activeEvent.forecastDepthInches}&quot; forecast</Badge>
            )}
          </>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => { void refetchEvents(); void refetchVisits(); }}
            className="h-9 w-9 max-lg:h-11 max-lg:w-11 flex items-center justify-center rounded border border-border text-muted-foreground hover:text-slate-800 dark:hover:text-neutral-100"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {canManage && (
            <Button size="sm" variant="outline" className="h-9 max-lg:h-11 text-xs gap-1.5" onClick={() => setCrewAssignOpen(true)} disabled={!activeEvent}>
              <Users className="h-3.5 w-3.5" />Team Assign
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-9 max-lg:h-11 text-xs gap-1.5" onClick={() => setPrintOpen(true)} disabled={!activeEvent}>
            <Printer className="h-3.5 w-3.5" />Print
          </Button>
          {canManage && (
            <Button size="sm" className="h-9 max-lg:h-11 text-xs gap-1.5" onClick={() => setAddJobsOpen(true)} disabled={!activeEvent}>
              <Plus className="h-3.5 w-3.5" />Add Jobs
            </Button>
          )}
        </div>
      </div>

      {/* Dark action bar — same layout as the Dispatch Board: status tabs, crew filter, actions, search, columns */}
      {activeEvent && (
        <div className="bg-[#4a4a4a] px-4 py-2 flex flex-wrap xl:flex-nowrap items-center gap-x-3 gap-y-2 shrink-0">
          <button
            onClick={() => { void refetchVisits(); }}
            title="Refresh"
            className="h-7 w-7 max-lg:h-9 max-lg:w-9 flex items-center justify-center rounded bg-[#5a5a5a] border border-[#6a6a6a] text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>

          <div className="flex items-center max-lg:max-w-full max-lg:overflow-x-auto max-lg:[&>*]:shrink-0 max-lg:[&>*]:whitespace-nowrap">
            {SNOW_FILTER_TABS.map((t) => {
              const cnt = t.value === "all" ? visits.length : visits.filter((v) => v.status === t.value).length;
              return (
                <button
                  key={t.value}
                  onClick={() => setStatusFilter(t.value)}
                  className={cn(
                    "px-2.5 py-1 max-lg:py-2.5 text-[10px] font-medium rounded transition-colors",
                    statusFilter === t.value ? "bg-card text-slate-800 dark:text-neutral-100" : "text-slate-300 hover:text-white"
                  )}
                >
                  {t.label}
                  {cnt > 0 && (
                    <span className={cn(
                      "ml-1 rounded-full px-1 text-[9px]",
                      statusFilter === t.value ? "bg-slate-200 dark:bg-neutral-700 text-slate-700 dark:text-neutral-300" : "bg-slate-600 text-slate-300 dm-fixed-dark"
                    )}>
                      {cnt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button className="h-7 max-lg:h-9 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
                <Users className="h-3 w-3" />
                {crewFilters.length === 0 ? "All Crews" : `${crewFilters.length} Crew${crewFilters.length > 1 ? "s" : ""}`}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
              <FilterOptionRow checked={crewFilters.length === 0} onToggle={() => setCrewFilters([])}>All Crews</FilterOptionRow>
              <FilterOptionRow checked={crewFilters.includes("none")} onToggle={() => toggleCrewFilter("none")}>Unassigned</FilterOptionRow>
              {crews.map((c) => (
                <FilterOptionRow key={c.id} checked={crewFilters.includes(c.id)} onToggle={() => toggleCrewFilter(c.id)}>
                  {c.name}
                </FilterOptionRow>
              ))}
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 max-lg:h-9 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
                <ListChecks className="h-3 w-3" />
                Actions{selectedVisitIds.size > 0 ? ` (${selectedVisitIds.size})` : ""}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {canManage && (
                <>
                  <DropdownMenuItem onSelect={() => void dispatchVisits(selectedVisitIds.size > 0 ? [...selectedVisitIds] : null)}>
                    {selectedVisitIds.size > 0 ? "Dispatch Selected" : "Dispatch All Assigned"}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={selectedVisitIds.size === 0} onSelect={() => setCloseOutIds(new Set(selectedVisitIds))}>
                    Close Out Selected…
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={selectedVisitIds.size === 0} onSelect={() => setOutcomeDialog({ ids: [...selectedVisitIds], status: "skipped" })}>
                    Skip Selected…
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={selectedVisitIds.size === 0} onSelect={() => setOutcomeDialog({ ids: [...selectedVisitIds], status: "cancelled" })}>
                    Cancel Selected…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setCrewAssignOpen(true)}>Team Assign…</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void optimizeRoutes()} disabled={optimizing || visits.length < 2}>
                    {selectedVisitIds.size > 0 ? "Optimize Selected Routes" : "Optimize Routes"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onSelect={() => setStatsOpen((o) => !o)}>{statsOpen ? "Hide Crew Stats" : "Show Crew Stats"}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPrintOpen(true)}>Print Route Sheets…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { setSearch(""); setCrewFilters([]); setStatusFilter("all"); setSelectedVisitIds(new Set()); }}>
                Clear Filters &amp; Selection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search…"
            className="w-44 max-sm:w-full max-sm:basis-full"
            inputClassName="h-7 max-lg:h-9 text-xs"
          />
          <span className="text-[10px] text-slate-300">{filteredVisits.length} of {visits.length} stops</span>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setMapOpen((o) => !o)}
              className={cn(
                "h-7 max-lg:h-9 flex items-center gap-1.5 rounded border px-2.5 text-[10px] transition-colors",
                mapOpen ? "bg-card text-slate-800 dark:text-neutral-100 border-card" : "bg-[#5a5a5a] border-[#6a6a6a] text-slate-200 hover:text-white"
              )}
            >
              <MapPin className="h-3 w-3" />Map
            </button>
            {canManage && (
              <>
                <Select value={routeStrategy} onValueChange={(v) => setRouteStrategy(v as typeof routeStrategy)}>
                  <SelectTrigger className="h-7 max-lg:h-9 w-32 text-[10px] bg-[#5a5a5a] border-[#6a6a6a] text-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nearest_first">Nearest first</SelectItem>
                    <SelectItem value="furthest_first">Furthest first</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => void optimizeRoutes()}
                  disabled={optimizing || visits.length < 2}
                  className="h-7 max-lg:h-9 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors disabled:opacity-50"
                >
                  <RouteIcon className="h-3 w-3" />{optimizing ? "Optimizing…" : "Optimize"}
                </button>
              </>
            )}
            <ColumnChooser columns={SNOW_COLUMNS} visibleKeys={visibleKeys} onVisibleKeysChange={setVisibleKeys} />
          </div>
        </div>
      )}

      {statsOpen && activeEvent && (
        <div className="mx-4 shrink-0 rounded-lg border bg-card p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {crewStats.map((c) => (
              <div key={c.key} className="rounded border px-3 py-2">
                <p className="truncate text-xs font-semibold text-slate-700 dark:text-neutral-300">{c.name}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {c.total} stops · {c.done} done · {c.total - c.done} left
                </p>
                <p className="text-[11px] font-medium text-slate-700 dark:text-neutral-300">{c.amount > 0 ? formatCurrency(c.amount) : "—"}</p>
              </div>
            ))}
            {crewStats.length === 0 && <p className="text-xs italic text-muted-foreground">No stops to summarize</p>}
          </div>
        </div>
      )}

      {mapOpen && activeEvent && (
        <div className="mx-4 overflow-hidden rounded-lg border shrink-0">
          {orgSettings?.googleMapsApiKey ? (
            <DispatchMap
              apiKey={orgSettings.googleMapsApiKey}
              stops={filteredVisits.map((v): DispatchMapStop => {
                const crewId = effectiveCrewIdOf(v);
                return {
                  visitId: v.id,
                  jobId: v.jobId,
                  order: stopNumberById.get(v.id) ?? 0,
                  clientName: v.clientName ?? "Unknown client",
                  address: [v.job?.serviceAddress, v.job?.serviceCity].filter(Boolean).join(", "),
                  crewKey: crewId ?? "__none__",
                  crewLabel: (crewId && crewNameById.get(crewId)) || "Unassigned",
                  statusLabel: v.status,
                  lat: v.job?.lat ?? null,
                  lng: v.job?.lng ?? null,
                };
              })}
            />
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Google Maps API key not configured. Add it in Settings → Integrations.
            </p>
          )}
        </div>
      )}

      {/* Selected-visit actions */}
      {selectedVisitIds.size > 0 && (
        <div className="mx-4 flex flex-wrap items-center gap-2 rounded border bg-brand-50 dark:bg-brand-900/30 px-3 py-2 shrink-0">
          <ListChecks className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <span className="text-xs font-medium text-brand-700 dark:text-brand-400">{selectedVisitIds.size} selected</span>
          {canManage && (
            <>
              <Select value="" onValueChange={(v) => void changeCrew([...selectedVisitIds], v === "none" ? null : v)}>
                <SelectTrigger className="h-7 w-40 text-xs ml-2"><SelectValue placeholder="Assign crew…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {crews.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-7 text-xs" onClick={() => setCloseOutIds(new Set(selectedVisitIds))}>
                Close Out…
              </Button>
            </>
          )}
          <button className="ml-auto text-xs text-slate-400 dark:text-neutral-500 hover:text-slate-600 dark:hover:text-neutral-400" onClick={() => setSelectedVisitIds(new Set())}>Clear</button>
        </div>
      )}

      {/* Visit table */}
      <div className="flex-1 overflow-auto overscroll-x-contain bg-card mx-4 rounded-lg border shadow-sm max-lg:min-h-[60dvh]">
        {!activeEvent ? (
          <p className="py-20 text-center text-sm text-slate-400 dark:text-neutral-500">
            {eventsLoading ? "Loading…" : "No storm events yet — create one to start dispatching."}
          </p>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-muted/40 border-b">
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                <th className="w-8 px-2 py-2.5" />
                <th className="w-12 px-2 py-2.5">#</th>
                <th className="w-8 px-2 py-2.5">St</th>
                <th className="min-w-[140px] px-2 py-2.5 max-lg:sticky max-lg:left-0 max-lg:z-20 max-lg:bg-slate-50 dark:max-lg:bg-muted/40 max-lg:shadow-[1px_0_0_rgb(226_232_240)]">Client</th>
                {isVisible("address") && <th className="px-2 py-2.5">Address</th>}
                {isVisible("city") && <th className="px-2 py-2.5">City</th>}
                {isVisible("zip") && <th className="px-2 py-2.5">Zip</th>}
                {isVisible("trigger") && <th className="px-2 py-2.5">Trigger</th>}
                {isVisible("crew") && <th className="px-2 py-2.5">Crew</th>}
                {isVisible("depth") && <th className="px-2 py-2.5 text-right">Depth</th>}
                {isVisible("temp") && <th className="px-2 py-2.5 text-right">Temp</th>}
                {isVisible("notes") && <th className="px-2 py-2.5">Notes to Crew</th>}
                {isVisible("amt") && <th className="px-2 py-2.5 text-right">Amt</th>}
              </tr>
            </thead>
            <tbody>
              {visitsLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 4 + visibleKeys.length }).map((__, j) => <td key={j} className="px-2 py-2.5"><Skeleton className="h-3 w-full" /></td>)}
                  </tr>
                ))
              ) : visits.length === 0 ? (
                <tr><td colSpan={4 + visibleKeys.length} className="py-20 text-center text-sm text-slate-400 dark:text-neutral-500">No jobs dispatched to this storm event yet.</td></tr>
              ) : filteredVisits.length === 0 ? (
                <tr><td colSpan={4 + visibleKeys.length} className="py-20 text-center text-sm text-slate-400 dark:text-neutral-500">No stops match the current filters.</td></tr>
              ) : (
                <>
                  <tr className="bg-muted text-[10px] font-semibold text-slate-700 dark:text-neutral-300">
                    <td colSpan={isVisible("amt") ? 3 + visibleKeys.length : 4 + visibleKeys.length} className="px-2 py-1.5 text-right text-muted-foreground">Totals</td>
                    {isVisible("amt") && (
                      <td className="px-2 py-1.5 text-right">{(filteredVisits.length === visits.length ? totalAmt : filteredTotalAmt) > 0 ? formatCurrency(filteredVisits.length === visits.length ? totalAmt : filteredTotalAmt) : "—"}</td>
                    )}
                  </tr>
                  {filteredVisits.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-slate-100 dark:border-neutral-800 bg-card hover:bg-slate-50 dark:hover:bg-muted/40 cursor-pointer"
                      onClick={() => setSelectedJobId(v.jobId)}
                    >
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        {/* ~42px touch target on phones; display:contents on desktop */}
                        <label className="-m-3.5 flex cursor-pointer items-center justify-center p-3.5 lg:contents">
                          <Checkbox checked={selectedVisitIds.has(v.id)} onCheckedChange={() => toggleSelect(v.id)} className="h-3.5 w-3.5" />
                        </label>
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <span className="w-4 text-center text-[11px] text-slate-500 dark:text-neutral-400">{stopNumberById.get(v.id)}</span>
                          {canManage && (
                            <span className="flex flex-col">
                              <button type="button" title="Move up in route" className="text-slate-300 hover:text-slate-600 dark:text-neutral-600 dark:hover:text-neutral-300" onClick={() => void moveStop(v, -1)}><ArrowUp className="h-3 w-3" /></button>
                              <button type="button" title="Move down in route" className="text-slate-300 hover:text-slate-600 dark:text-neutral-600 dark:hover:text-neutral-300" onClick={() => void moveStop(v, 1)}><ArrowDown className="h-3 w-3" /></button>
                            </span>
                          )}
                        </div>
                        {driveMins.get(v.id) && (
                          <div
                            className="text-[9px] leading-tight text-blue-500 dark:text-blue-400 whitespace-nowrap"
                            title={driveMins.get(v.id)!.fromShop ? "Drive time from the shop" : "Drive time from the previous stop"}
                          >
                            {driveMins.get(v.id)!.fromShop ? "⌂" : "↑"}{driveMins.get(v.id)!.mins}m
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><StatusCycleButton visit={v} /></td>
                      <td className="px-2 py-2 max-lg:sticky max-lg:left-0 max-lg:z-[1] max-lg:bg-inherit max-lg:shadow-[1px_0_0_rgb(226_232_240)]" onClick={(e) => e.stopPropagation()}>
                        <Link href={`/crm/clients/${v.clientId}`} className="font-medium text-brand-600 dark:text-brand-400 hover:underline">{v.clientName ?? "—"}</Link>
                      </td>
                      {isVisible("address") && <td className="px-2 py-2 text-muted-foreground">{v.job?.serviceAddress ?? "—"}</td>}
                      {isVisible("city") && <td className="px-2 py-2 text-muted-foreground">{v.job?.serviceCity ?? "—"}</td>}
                      {isVisible("zip") && <td className="px-2 py-2 text-muted-foreground">{v.job?.serviceZip ?? "—"}</td>}
                      {isVisible("trigger") && <td className="px-2 py-2 text-muted-foreground">{v.job?.inchTrigger != null ? `${v.job.inchTrigger}"` : "—"}</td>}
                      {isVisible("crew") && <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                        {canManage ? (
                          <Select value={effectiveCrewIdOf(v) ?? "none"} onValueChange={(c) => void changeCrew([v.id], c === "none" ? null : c)}>
                            <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Unassigned</SelectItem>
                              {crews.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : effectiveCrewIdOf(v) ? (
                          <Badge variant="secondary" className="text-[10px]">{crewNameById.get(effectiveCrewIdOf(v)!) ?? v.crewName}</Badge>
                        ) : <span className="text-slate-300 dark:text-neutral-500 italic">—</span>}
                      </td>}
                      {isVisible("depth") && <td className="px-2 py-2 text-right text-muted-foreground">{v.snowDepthInches != null ? `${v.snowDepthInches}"` : "—"}</td>}
                      {isVisible("temp") && <td className="px-2 py-2 text-right text-muted-foreground">{v.temperature != null ? `${v.temperature}°` : "—"}</td>}
                      {isVisible("notes") && <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}><NotesToCrewCell visit={v} canEdit={canManage} /></td>}
                      {isVisible("amt") && <td className="px-2 py-2 text-right font-medium text-slate-700 dark:text-neutral-300">
                        {amountByVisitId.has(v.id) ? formatCurrency(amountByVisitId.get(v.id) ?? 0) : "—"}
                      </td>}
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        )}
      </div>

      <OutcomeDialog state={outcomeDialog} onClose={() => setOutcomeDialog(null)} onConfirm={applyOutcome} />

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
