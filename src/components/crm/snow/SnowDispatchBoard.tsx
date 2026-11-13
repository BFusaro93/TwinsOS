"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStormEvents,
  useCreateStormEvent,
  useUpdateStormEvent,
  useSnowRoutes,
  useSnowRouteStops,
  useMasterRouteSlots,
  useSaveStormOrderToRoutes,
  useSnowJobs,
  useStormEventVisits,
  useAddJobsToStormEvent,
  useAddStormPush,
} from "@/lib/hooks/use-snow-dispatch";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { todayInZone } from "@/lib/time/zone";
import { useCRMCrews, useUpdateVisit, useUpdateVisitStatus } from "@/lib/hooks/use-crm-jobs";
import { printSnowRouteSheets } from "@/lib/print";
import { JobDetailSheet } from "@/components/crm/jobs/JobDetailSheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { DispatchWeather } from "@/components/crm/dispatch/DispatchWeather";
import { SearchInput } from "@/components/shared/SearchInput";
import { SnowWorkMap, type SnowMapStop } from "@/components/crm/snow/SnowWorkMap";
import { MasterRoutesDialog } from "@/components/crm/snow/MasterRoutesDialog";
import { SnowMessageDialog, type SnowMessageChannel } from "@/components/crm/snow/SnowMessageDialog";
import { SnowNoEmailDialog } from "@/components/crm/snow/SnowNoEmailDialog";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ColumnChooser, type ColumnDef } from "@/components/shared/ColumnChooser";
import { FilterOptionRow } from "@/components/shared/FilterOptionRow";
import { buildSnowStopsCsv, downloadCsv, splitCancelDispatchTargets } from "@/components/crm/snow/snow-board-actions";
import { useOrgTags } from "@/lib/hooks/use-clients";
import { BulkMultiCrewDialog } from "@/components/crm/dispatch/BulkMultiCrewDialog";
import { usePersistedColumns } from "@/lib/hooks/use-ui-prefs";
import { formatCurrency, cn } from "@/lib/utils";
import { billingGroupKey } from "@/lib/hooks/use-snow-invoicing";
import { useSnowRateTiersForJobs } from "@/lib/hooks/use-snow-rate-tiers";
import { useSnowCapJobFlags } from "@/lib/hooks/use-snow-caps";
import { computeGroupAmountCents, hourlyStopShares, isUnbilledSnowVisit, liftStormDepths, splitGroupAmountByVisit, type SnowBillableVisit } from "@/lib/snow-billing";
import { toast } from "sonner";
import {
  Snowflake, Plus, Printer, Users, ChevronDown, RefreshCw,
  Calendar, Smartphone, CalendarCheck, CheckCircle2, XCircle, CornerDownRight,
  ListChecks, ThermometerSnowflake, Ruler, HelpCircle, MapPin, ArrowUp, ArrowDown, Route as RouteIcon, Search, Tag, Mail, MessageSquare, Download, BarChart3, SkipForward, Undo2, Eraser,
} from "lucide-react";
import type { CRMJobVisit, VisitStatus, StormEventStatus } from "@/types/crm-jobs";

// ── helpers ───────────────────────────────────────────────────────────────────

const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function dayAbbrForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return DAY_ABBR[new Date(y, m - 1, d).getDay()];
}

// clients.priority is 'high' | 'normal' | 'low' — lower rank number sorts first (higher priority)
const PRIORITY_RANK: Record<string, number> = { high: 1, normal: 2, low: 3 };

/** Icon spacing/colour used on every Actions-menu item (same as the Dispatch Board's menu). */
const MENU_ICON = "mr-2 h-3.5 w-3.5 text-slate-400 dark:text-neutral-500";

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
  { key: "date", label: "Date" },
  { key: "service", label: "Service" },
  { key: "address", label: "Address" },
  { key: "city", label: "City", defaultHidden: true },
  { key: "state", label: "State", defaultHidden: true },
  { key: "zip", label: "Zip", defaultHidden: true },
  { key: "priority", label: "Priority", defaultHidden: true },
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

// Skipping needs a reason (the outcome dialog), so it is not part of the one-tap cycle.
const STATUS_CYCLE: VisitStatus[] = ["scheduled", "dispatched", "in_progress", "completed"];

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
    if (i === -1) return;
    const next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    // Completing invoices and fires automations; reopening a completed stop clears its clock
    // stamps. Neither should happen from a stray tap on an iPad.
    if (next === "completed" && !window.confirm("Mark this stop completed? It will be invoiced and automations will run.")) return;
    if (visit.status === "completed" && !window.confirm("Reopen this completed stop so the crew can work it again?")) return;
    try {
      await updateStatus({ id: visit.id, status: next, jobId: visit.jobId, jobType: visit.job?.jobType });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to update status");
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
  // The org's day, not the browser's — a dispatcher in another zone (or late
  // at night) defaulted the storm to the wrong date.
  const today = todayInZone(useOrgTimeZone());
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
  const [date, setDate] = useState(eventDate);
  // Judged against the storm's dispatch date: a contract's dates (and its
  // "storms outside the contract dates" setting) decide which jobs are offered.
  const { data: snowJobs = [], isLoading: jobsLoading } = useSnowJobs(date);
  const { data: routes = [] } = useSnowRoutes();
  const { data: crews = [] } = useCRMCrews();
  const addJobs = useAddJobsToStormEvent();

  const [routeId, setRouteId] = useState("");
  const { data: routeStops = [] } = useSnowRouteStops(routeId);
  const [maxTriggerInches, setMaxTriggerInches] = useState(forecastDepthInches != null ? String(forecastDepthInches) : "");
  const [minPriority, setMinPriority] = useState("");
  const [defaultCrewId, setDefaultCrewId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [jobSearch, setJobSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  // Per-job date overrides (job id → yyyy-mm-dd); jobs without one follow the dispatch date.
  const [rowDates, setRowDates] = useState<Map<string, string>>(new Map());
  const [bulkDate, setBulkDate] = useState("");

  const { data: masterSlots } = useMasterRouteSlots();
  const selectedRoute = routes.find((r) => r.id === routeId);

  // With no route picked, keep the saved Master Route order (route by route,
  // stop by stop) rather than arbitrary job order, so every storm comes up in
  // the same sequence. Jobs on no route follow, in their usual order.
  const candidateJobIds = routeId
    ? routeStops.map((s) => s.jobId)
    : snowJobs
        .map((j, i) => ({ id: j.id, i, slot: masterSlots?.get(j.id) }))
        .sort((a, b) => {
          if (!!a.slot !== !!b.slot) return a.slot ? -1 : 1;
          if (a.slot && b.slot) {
            const byRoute = a.slot.routeName.localeCompare(b.slot.routeName);
            if (byRoute !== 0) return byRoute;
            if (a.slot.sortOrder !== b.slot.sortOrder) return a.slot.sortOrder - b.slot.sortOrder;
          }
          return a.i - b.i;
        })
        .map((x) => x.id);
  const candidates = useMemo(() => {
    const byId = new Map(snowJobs.map((j) => [j.id, j]));
    return candidateJobIds
      .map((id) => byId.get(id))
      .filter((j): j is NonNullable<typeof j> => !!j)
      .map((job) => {
        const overTrigger = maxTriggerInches !== "" && job.inchTrigger != null && job.inchTrigger > parseFloat(maxTriggerInches);
        const rank = PRIORITY_RANK[job.clientPriority ?? "low"] ?? 3;
        const underPriority = minPriority !== "" && rank > (PRIORITY_RANK[minPriority] ?? 3);
        const dayNotAuthorized = !!job.scheduleDays?.length && !job.scheduleDays.includes(dayAbbrForDate(rowDates.get(job.id) ?? date));
        return { job, excluded: overTrigger || underPriority || dayNotAuthorized };
      });
  }, [candidateJobIds, snowJobs, maxTriggerInches, minPriority, date, rowDates]);

  // The search narrows what is listed (and what Select all / Unselect all act on);
  // jobs already ticked stay ticked while hidden and are still added.
  const serviceOptions = useMemo(
    () => [...new Set(candidates.flatMap(({ job }) => (job.services ?? []).map((s) => s.serviceName).filter(Boolean)))].sort((a, b) => a.localeCompare(b)),
    [candidates],
  );
  const visibleCandidates = useMemo(() => {
    const q = jobSearch.trim().toLowerCase();
    const byService = serviceFilter ? candidates.filter(({ job }) => (job.services ?? []).some((s) => s.serviceName === serviceFilter)) : candidates;
    if (!q) return byService;
    return byService.filter(({ job }) =>
      [job.clientName, job.serviceAddress, job.serviceCity, job.serviceZip, job.crewName, job.services?.[0]?.serviceName, job.invoiceDescription]
        .filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [candidates, jobSearch, serviceFilter]);

  // Each opening starts from this storm's own date and forecast, not whatever
  // the dialog was last left at.
  const [seeded, setSeeded] = useState(false);
  if (open && !seeded) {
    setSeeded(true);
    setJobSearch("");
    setServiceFilter("");
    setRowDates(new Map());
    setBulkDate("");
    setDate(eventDate);
    setMaxTriggerInches(forecastDepthInches != null ? String(forecastDepthInches) : "");
  }
  if (open && seeded && !initialized && candidates.length > 0) {
    setSelectedIds(new Set(candidates.filter((c) => !c.excluded).map((c) => c.job.id)));
    setInitialized(true);
  }

  // When a filter change newly excludes a ticked row (deeper trigger, lower
  // priority, unauthorized day), untick it — red rows used to stay ticked and
  // were dispatched anyway. A row the user re-ticks afterwards stays ticked.
  const excludedKey = candidates.filter((c) => c.excluded).map((c) => c.job.id).join(",");
  const [prevExcludedKey, setPrevExcludedKey] = useState(excludedKey);
  if (excludedKey !== prevExcludedKey) {
    const before = new Set(prevExcludedKey ? prevExcludedKey.split(",") : []);
    const newlyExcluded = candidates.filter((c) => c.excluded && !before.has(c.job.id)).map((c) => c.job.id);
    setPrevExcludedKey(excludedKey);
    if (newlyExcluded.length > 0 && newlyExcluded.some((id) => selectedIds.has(id))) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of newlyExcluded) next.delete(id);
        return next;
      });
    }
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
      .map((c) => ({
        jobId: c.job.id,
        clientId: c.job.clientId,
        date: rowDates.get(c.job.id) ?? null,
        // Explicit crew pick, else the job's Master Route crew, else the job's own crew.
        crewId: defaultCrewId
          || (routeId ? selectedRoute?.defaultCrewId : masterSlots?.get(c.job.id)?.routeCrewId)
          || c.job.crewId
          || null,
      }));
    if (jobs.length === 0) { toast.error("No jobs selected"); return; }
    try {
      const added = await addJobs.mutateAsync({ stormEventId, date, jobs });
      // Jobs already on the storm (or added by another dispatcher meanwhile)
      // are skipped, so report what was actually added.
      const skipped = jobs.length - added;
      if (added === 0) {
        toast.info(`${jobs.length === 1 ? "That job is" : "All selected jobs are"} already on this storm event`);
      } else {
        toast.success(
          `Added ${added} job${added !== 1 ? "s" : ""} to the storm event` +
          (skipped > 0 ? ` (${skipped} already on it)` : "")
        );
      }
      onDone();
      onOpenChange(false);
      setInitialized(false);
      setSeeded(false);
    } catch {
      toast.error("Failed to add jobs");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setInitialized(false); setSeeded(false); } }}>
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

        <div className="shrink-0 border-b px-5 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={jobSearch}
              onChange={(e) => setJobSearch(e.target.value)}
              placeholder="Search clients, address, city, zip, crew…"
              className="h-8 pl-8 text-xs"
              aria-label="Search snow jobs"
            />
          </div>
          {serviceOptions.length > 1 && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Service:</span>
              <Select value={serviceFilter || "all"} onValueChange={(v) => setServiceFilter(v === "all" ? "" : v)}>
                <SelectTrigger className="h-8 w-56 text-xs" aria-label="Filter by service"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All services</SelectItem>
                  {serviceOptions.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Date for the {selectedIds.size} selected:</span>
            <Input type="date" value={bulkDate} onChange={(e) => setBulkDate(e.target.value)} className="h-8 w-40 text-xs" aria-label="Date for the selected jobs" />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={!bulkDate || selectedIds.size === 0}
              onClick={() => setRowDates((prev) => { const next = new Map(prev); selectedIds.forEach((id) => next.set(id, bulkDate)); return next; })}
            >
              Set date
            </Button>
            {rowDates.size > 0 && (
              <button type="button" className="text-[11px] text-muted-foreground underline hover:text-foreground" onClick={() => setRowDates(new Map())}>
                Reset all to {date}
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {jobsLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-neutral-500 py-12">No snow jobs found{routeId ? " on this route" : ""}.</p>
          ) : visibleCandidates.length === 0 ? (
            <p className="text-center text-sm text-slate-400 dark:text-neutral-500 py-12">No snow jobs match{jobSearch.trim() ? <> &ldquo;{jobSearch.trim()}&rdquo;</> : " this filter"}.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-muted/40 border-b">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">
                  <th className="w-8 px-3 py-2">
                    <Checkbox
                      checked={visibleCandidates.every((c) => selectedIds.has(c.job.id)) ? true : visibleCandidates.some((c) => selectedIds.has(c.job.id)) ? "indeterminate" : false}
                      onCheckedChange={() => setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (visibleCandidates.every((c) => next.has(c.job.id))) visibleCandidates.forEach((c) => next.delete(c.job.id));
                        else visibleCandidates.forEach((c) => next.add(c.job.id));
                        return next;
                      })}
                      aria-label="Select or unselect all listed jobs"
                      className="h-3.5 w-3.5"
                    />
                  </th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Crew</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {visibleCandidates.map(({ job, excluded }) => (
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
                    <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <Input
                        type="date"
                        value={rowDates.get(job.id) ?? date}
                        onChange={(e) => setRowDates((prev) => {
                          const next = new Map(prev);
                          if (!e.target.value || e.target.value === date) next.delete(job.id); else next.set(job.id, e.target.value);
                          return next;
                        })}
                        className={cn("h-7 w-36 text-xs", rowDates.has(job.id) && "border-brand-400")}
                        aria-label={`Date for ${job.clientName ?? "job"}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="shrink-0 flex items-center justify-between border-t bg-card px-5 py-3">
          <p className="text-xs text-muted-foreground">
            {selectedIds.size} of {candidates.length} selected
            <button type="button" className="ml-2 underline hover:text-foreground" onClick={() => setSelectedIds((prev) => new Set([...prev, ...visibleCandidates.map((c) => c.job.id)]))}>Select all</button>
            <button type="button" className="ml-2 underline hover:text-foreground" onClick={() => setSelectedIds((prev) => { const next = new Set(prev); visibleCandidates.forEach((c) => next.delete(c.job.id)); return next; })}>Unselect all</button>
          </p>
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
      // Skipped / cancelled stops are called off, not worked — closing them out
      // would complete (and bill) a stop the crew never plowed.
      const pending = visits.filter((v) => v.status !== "completed" && v.status !== "skipped" && v.status !== "cancelled");
      if (pending.length === 0) {
        toast.info("These visits are already closed out, skipped or cancelled");
        onDone();
        onOpenChange(false);
        return;
      }
      const totalHours = actualHours ? parseFloat(actualHours) : null;
      // Hours are entered once for the whole batch (e.g. "2.5 hrs" for this close-out), not per stop.
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
              // Hours entered here are hours ON SITE (what an hourly snow job bills,
              // once). actual_hours is man-hours for job costing — the crew-app
              // clock-out stores Σ every member's punches — so it's stored × the
              // visit's men, and snowBillableHours divides it back for billing.
              ...(hoursPerVisit !== null && v.job?.invoiceType === "hourly"
                ? { actual_hours: Math.round(hoursPerVisit * Math.max(1, v.menCount || 1) * 100) / 100 }
                : {}),
            },
          });
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
              <Label>Hours on Site <span className="text-slate-400 dark:text-neutral-500">(billed hourly, once per visit — not per crew member)</span></Label>
              <Input type="number" step="0.25" value={actualHours} onChange={(e) => setActualHours(e.target.value)} placeholder="e.g. 2.5" className="h-9 text-sm" />
            </div>
          )}
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

/** Flat Per Event job: a return trip is no-charge unless marked billed (e.g. a second salting). On
 *  Per Event, Per Inch a return trip is simply part of the event — its depth counts toward the storm's deepest reading. */
function isFlatPerEvent(v: CRMJobVisit): boolean {
  return (v.job?.invoiceType ?? "per_event") === "per_event";
}

/** "Mon 11/16" for a yyyy-mm-dd date (read at noon so a timezone never shifts the day). */
function shortDateLabel(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`;
}

/** A stop's date. Office users can change it (a storm that runs several days has stops on different days);
 *  the crew sees the stop on the day it is scheduled for. */
function VisitDateCell({ visit, canEdit, onSave }: { visit: CRMJobVisit; canEdit: boolean; onSave: (id: string, date: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(visit.scheduledDate ?? "");
  const [saving, setSaving] = useState(false);
  const label = shortDateLabel(visit.scheduledDate);
  if (!canEdit || visit.status === "completed" || visit.status === "cancelled") return <span>{label}</span>;
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(visit.scheduledDate ?? ""); }}>
      <PopoverTrigger asChild>
        <button type="button" title="Change this stop's date" className="rounded px-1 -mx-1 underline decoration-dotted underline-offset-2 hover:bg-muted">{label}</button>
      </PopoverTrigger>
      <PopoverContent className="w-52 space-y-2 p-3" align="start">
        <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} className="h-8 text-xs" />
        <Button
          size="sm"
          className="h-7 w-full text-xs"
          disabled={saving || !value || value === visit.scheduledDate}
          onClick={async () => { setSaving(true); try { await onSave(visit.id, value); setOpen(false); } finally { setSaving(false); } }}
        >
          Move to this date
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** The service a snow stop is for — several snow jobs at one address are told apart by it. */
function visitServiceName(v: CRMJobVisit): string {
  return v.job?.services?.[0]?.serviceName || v.job?.invoiceDescription || "Snow Service";
}

/** A "Select a Filter" pill for the white strip above the dark bar (same look as the Dispatch Board's):
 *  click it for a multi-select checklist; it shows how many values are picked. */
function FilterPill({ label, options, selected, onChange, format, searchable }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  format?: (value: string) => string;
  /** Adds a search box (for long lists, e.g. every client on the storm). */
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const shownOptions = query.trim() ? options.filter((o) => (format ? format(o) : o).toLowerCase().includes(query.trim().toLowerCase())) : options;
  const toggleValue = (o: string) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded px-2 py-0.5 max-lg:py-2 text-xs transition-colors whitespace-nowrap",
            selected.length > 0
              ? "bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-400 font-medium"
              : "hover:bg-muted text-slate-600 dark:text-neutral-400"
          )}
        >
          {label}
          {selected.length > 0 && <span className="ml-1 text-brand-500 dark:text-brand-400">· {selected.length}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 max-h-[min(24rem,var(--radix-popover-content-available-height,24rem))] overflow-y-auto overscroll-contain p-1" align="start">
        <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">{label}</p>
        {searchable && (
          <div className="px-1 pb-1">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${label.toLowerCase()}s…`} className="h-7 text-xs" aria-label={`Search ${label.toLowerCase()}s`} />
          </div>
        )}
        {options.length === 0 && <p className="px-2 py-2 text-xs italic text-slate-400 dark:text-neutral-500">Nothing to filter yet</p>}
        {options.length > 0 && shownOptions.length === 0 && <p className="px-2 py-2 text-xs italic text-slate-400 dark:text-neutral-500">No match</p>}
        {shownOptions.map((o) => (
          <FilterOptionRow
            key={o}
            checked={selected.includes(o)}
            onToggle={() => toggleValue(o)}
            className={selected.includes(o) ? "bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-400 font-medium" : undefined}
          >
            {format ? format(o) : o}
          </FilterOptionRow>
        ))}
        {selected.length > 0 && (
          <div className="mt-1 border-t pt-1">
            <button className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-muted dark:text-neutral-500" onClick={() => onChange([])}>
              Clear filter
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Every icon and badge on the snow board, for the Legend button (same idea as the Dispatch Board's). */
function SnowLegendDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const statusRows: { icon: React.ReactNode; label: string }[] = [
    { icon: <StatusIcon status="scheduled" />, label: "Scheduled" },
    { icon: <StatusIcon status="dispatched" />, label: "Dispatched — sent to the crew's tablet" },
    { icon: <StatusIcon status="in_progress" />, label: "In progress — crew is on site" },
    { icon: <StatusIcon status="completed" />, label: "Completed" },
    { icon: <StatusIcon status="skipped" />, label: "Skipped — called off, not billed" },
    { icon: <StatusIcon status="cancelled" />, label: "Cancelled" },
  ];
  const tag = (text: string, cls: string) => <span className={cn("rounded border px-1.5 py-0 text-[9px]", cls)}>{text}</span>;
  const badgeRows: { icon: React.ReactNode; label: string }[] = [
    { icon: tag("Push 2", "bg-muted border-transparent"), label: "A return trip to the same site on this storm (Push 2, 3…)" },
    { icon: tag("No charge", "text-muted-foreground"), label: "A return trip on a flat Per Event job that isn't billed (click to bill it)" },
    { icon: tag("Billed", "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400"), label: "A return trip billed as its own charge" },
    { icon: tag("Lead", ""), label: "Stop with more than one crew — this crew bills the stop" },
    { icon: tag("Extra crew", ""), label: "Another crew on the stop — its own hours; billed only on Hourly jobs" },
    { icon: tag("Handed off from …", "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"), label: "The crew app handed this stop off from a crew that couldn't make it" },
    { icon: tag("Overage", "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400"), label: "The contract's cap is used up — this stop bills as overage" },
  ];
  const section = (title: string, rows: { icon: React.ReactNode; label: string }[]) => (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-neutral-500">{title}</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2.5 text-xs">
            <span className="flex w-24 shrink-0 items-center justify-center">{r.icon}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Snow Board Legend</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {section("Status (St column)", statusRows)}
          {section("Tags next to the client", badgeRows)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A multi-select checklist filter chip for the board's dark action bar. */
function ValueFilter({ label, options, selected, onChange }: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggleValue = (o: string) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="h-7 max-lg:h-9 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
          {selected.length === 0 ? `All ${label}` : `${selected.length} ${label}`}
          <ChevronDown className="h-2.5 w-2.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 max-h-72 overflow-y-auto p-1" align="start">
        <FilterOptionRow checked={selected.length === 0} onToggle={() => onChange([])}>All {label}</FilterOptionRow>
        {options.map((o) => (
          <FilterOptionRow key={o} checked={selected.includes(o)} onToggle={() => toggleValue(o)}>{o}</FilterOptionRow>
        ))}
      </PopoverContent>
    </Popover>
  );
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
  const [visibleKeys, setVisibleKeys] = // v3: Date joined (v2: Service) the column set — a saved v1 layout would have hidden it for everyone who had customized columns.
  usePersistedColumns("snow_dispatch_v3", SNOW_COLUMNS.filter((c) => !c.defaultHidden).map((c) => c.key));
  const isVisible = (k: string) => visibleKeys.includes(k);
  const [multiCrewOpen, setMultiCrewOpen] = useState(false);
  const [messageChannel, setMessageChannel] = useState<SnowMessageChannel | null>(null);
  const [noEmailOpen, setNoEmailOpen] = useState(false);
  // Map: narrow the table to the stops picked on it.
  const [tableOnlySelected, setTableOnlySelected] = useState(false);
  const [serviceFilters, setServiceFilters] = useState<string[]>([]);
  const [priorityFilters, setPriorityFilters] = useState<string[]>([]);
  const [cityFilters, setCityFilters] = useState<string[]>([]);
  const [zipFilters, setZipFilters] = useState<string[]>([]);
  const [dateFilters, setDateFilters] = useState<string[]>([]);
  const [clientFilters, setClientFilters] = useState<string[]>([]);
  const [tagFilters, setTagFilters] = useState<string[]>([]);
  const orgTags = useOrgTags();
  const [moveDate, setMoveDate] = useState("");
  const { mutateAsync: updateVisitStatus } = useUpdateVisitStatus();
  const [statusFilter, setStatusFilter] = useState("all");
  const [routeStrategy, setRouteStrategy] = useState<"furthest_first" | "nearest_first">("nearest_first");
  const [optimizing, setOptimizing] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [routesOpen, setRoutesOpen] = useState(false);
  const { data: orgSettings } = useOrgSettings();
  // Minutes to ARRIVE at each stop (from the previous stop, or the shop for a crew's first stop).
  const [driveMins, setDriveMins] = useState<Map<string, { mins: number; fromShop: boolean }>>(new Map());
  const { mutateAsync: updateVisitMutation } = useUpdateVisit();
  const { mutateAsync: saveOrderToRoutes, isPending: savingOrder } = useSaveStormOrderToRoutes();
  const { mutateAsync: addStormPush, isPending: addingPush } = useAddStormPush();

  // Inactive storms are hidden from the picker unless asked for (or currently open).
  const [showInactiveEvents, setShowInactiveEvents] = useState(false);
  const inactiveEventCount = events.filter((e) => !e.isActive).length;
  const activeEvent = events.find((e) => e.id === selectedEventId) ?? events.find((e) => e.isActive) ?? events[0] ?? null;
  // Adding a visit to a Complete storm puts it back to Working (DB trigger);
  // the board doesn't offer it at all until someone does that on purpose.
  const stormComplete = activeEvent?.dispatchStatus === "complete";
  const effectiveEventId = activeEvent?.id ?? "";

  const { data: visits = [], isLoading: visitsLoading, refetch: refetchVisits } = useStormEventVisits(effectiveEventId);
  const { data: capFlags } = useSnowCapJobFlags(visits.map((v) => v.job?.contractId).filter((c): c is string => !!c));

  function toggleSelect(id: string) {
    setSelectedVisitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function toggleEventActive() {
    if (!activeEvent) return;
    const next = !activeEvent.isActive;
    try {
      await updateStormEvent({ id: activeEvent.id, patch: { is_active: next } });
      if (!next) setShowInactiveEvents(false);
      toast.success(next ? "Storm event marked active" : "Storm event marked inactive — hidden from the picker");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update storm event");
    }
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
    // Two hourly jobs at one crew stop each bill their share of it (as Snow Invoicing does).
    const shares = hourlyStopShares(visits);
    const byGroup = new Map<string, SnowBillableVisit[]>();
    const zeroIds: string[] = [];
    for (const visit of liftStormDepths(visits)) {
      const v: SnowBillableVisit = shares.has(visit.id) ? { ...visit, hourlyStopShare: shares.get(visit.id) } : visit;
      // Skipped and cancelled stops are called off, not plowed — nothing is billed for them, so
      // they get no amount (their row shows "—") and stay out of the totals and crew stats.
      if (v.status === "skipped" || v.status === "cancelled") continue;
      // An extra crew, or a return trip on a once-per-storm job, is recorded but bills $0.
      if (isUnbilledSnowVisit(v)) { zeroIds.push(v.id); continue; }
      const key = billingGroupKey(v);
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(v);
    }
    const result = new Map<string, number>();
    for (const id of zeroIds) result.set(id, 0);
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
  // Client messaging works on the selected stops; "Jobs without emails" falls back to everything shown.
  const selectedStops = useMemo(() => visits.filter((v) => selectedVisitIds.has(v.id)), [visits, selectedVisitIds]);
  const crewNameOf = useCallback(
    (v: CRMJobVisit) => (effectiveCrewIdOf(v) ? crewNameById.get(effectiveCrewIdOf(v)!) : null) ?? v.crewName ?? null,
    [crewNameById],
  );
  const canEmailClients = can("email_activity_send");
  const canTextClients = can("sms_send");

  // Each job's latest push on this storm — "Add push" hangs off that row only.
  const latestPushVisitIdByJob = useMemo(() => {
    const best = new Map<string, CRMJobVisit>();
    for (const v of visits) {
      if (v.crewGroupSecondary) continue; // an extra crew's visit isn't a push of its own
      const cur = best.get(v.jobId);
      if (!cur || (v.pushNumber ?? 1) > (cur.pushNumber ?? 1)) best.set(v.jobId, v);
    }
    return new Map([...best].map(([jobId, v]) => [jobId, v.id]));
  }, [visits]);

  /** Another visit to the site on this storm. Per Push / Hourly bill it; once-per-storm jobs record it at $0. */
  async function addPush(v: CRMJobVisit, billable = false) {
    if (stormComplete) return;
    try {
      const n = await addStormPush({ source: v, billable });
      toast.success(`Push ${n} added for ${v.clientName ?? "this job"}${billable ? " — billed as its own charge" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "Failed to add a push");
    }
  }

  const filteredVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return visits.filter((v) => {
      const crewId = effectiveCrewIdOf(v);
      if (crewFilters.length > 0 && !crewFilters.includes(crewId ?? "none")) return false;
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (tableOnlySelected && selectedVisitIds.size > 0 && !selectedVisitIds.has(v.id)) return false;
      if (serviceFilters.length > 0 && !serviceFilters.includes(visitServiceName(v))) return false;
      if (priorityFilters.length > 0 && !priorityFilters.includes(v.clientPriority ?? "none")) return false;
      if (cityFilters.length > 0 && !cityFilters.includes(v.job?.serviceCity ?? "—")) return false;
      if (zipFilters.length > 0 && !zipFilters.includes(v.job?.serviceZip ?? "—")) return false;
      if (dateFilters.length > 0 && !dateFilters.includes(v.scheduledDate ?? "—")) return false;
      if (clientFilters.length > 0 && !clientFilters.includes(v.clientId)) return false;
      // Client tags, "is any of" — same rule as the Dispatch Board's Tags filter.
      if (tagFilters.length > 0 && !tagFilters.some((t) => (v.clientTags ?? []).includes(t))) return false;
      if (q) {
        const hay = [
          v.clientName, visitServiceName(v), v.job?.serviceAddress, v.job?.serviceCity, v.job?.serviceState, v.job?.serviceZip, v.job?.notesToCrew,
          crewId ? crewNameById.get(crewId) : null,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [visits, search, crewFilters, statusFilter, tableOnlySelected, selectedVisitIds, serviceFilters, priorityFilters, cityFilters, zipFilters, dateFilters, clientFilters, tagFilters, crewNameById]);

  // Options for the value filters come from the stops on this storm.
  const serviceOptions = useMemo(() => [...new Set(visits.map(visitServiceName))].sort(), [visits]);
  const cityOptions = useMemo(() => [...new Set(visits.map((v) => v.job?.serviceCity ?? "—"))].sort(), [visits]);
  // One entry per client on this storm. Two different clients can share a display name, so those get their
  // service address appended to tell them apart in the picker.
  const clientNameById = useMemo(() => {
    const info = new Map<string, { name: string; address: string }>();
    for (const v of visits) if (!info.has(v.clientId)) info.set(v.clientId, { name: v.clientName ?? "Unknown client", address: v.job?.serviceAddress ?? "" });
    const perName = new Map<string, number>();
    for (const { name } of info.values()) perName.set(name, (perName.get(name) ?? 0) + 1);
    return new Map([...info].map(([id, { name, address }]) => [id, (perName.get(name) ?? 0) > 1 && address ? `${name} — ${address}` : name]));
  }, [visits]);
  const clientOptions = useMemo(() => [...clientNameById.keys()].sort((a, b) => (clientNameById.get(a) ?? "").localeCompare(clientNameById.get(b) ?? "")), [clientNameById]);
  const dateOptions = useMemo(() => [...new Set(visits.map((v) => v.scheduledDate ?? "—"))].sort(), [visits]);
  const zipOptions = useMemo(() => [...new Set(visits.map((v) => v.job?.serviceZip ?? "—"))].sort(), [visits]);

  const allShownSelected = filteredVisits.length > 0 && filteredVisits.every((v) => selectedVisitIds.has(v.id));
  const someShownSelected = filteredVisits.some((v) => selectedVisitIds.has(v.id));
  /** Select (or clear) every stop currently shown — filters narrow what "all" means. */
  function toggleSelectAllShown() {
    setSelectedVisitIds((prev) => {
      const next = new Set(prev);
      if (allShownSelected) filteredVisits.forEach((v) => next.delete(v.id));
      else filteredVisits.forEach((v) => next.add(v.id));
      return next;
    });
  }

  // Stop number within the crew's route, following order_num.
  const stopNumberById = useMemo(() => {
    const counters = new Map<string, number>();
    const result = new Map<string, number>();
    for (const v of visits) {
      // A storm can run several days; each crew's route is numbered within its day.
      const key = `${effectiveCrewIdOf(v) ?? "none"}|${v.scheduledDate ?? ""}`;
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

  /** Puts dispatched stops the crew hasn't started back to scheduled; started stops are refused. */
  async function cancelDispatch(ids: string[]) {
    const { cancellable, started, notDispatched } = splitCancelDispatchTargets(visits.filter((v) => ids.includes(v.id)));
    if (cancellable.length === 0) {
      toast.info(started.length > 0
        ? `${started.length} selected stop${started.length !== 1 ? "s have" : " has"} already been started by the crew — it can't be un-dispatched.`
        : "None of the selected stops are dispatched.");
      return;
    }
    try {
      await Promise.all(cancellable.map((v) => updateVisitMutation({
        id: v.id,
        updates: { status: "scheduled", dispatched_at: null },
        jobId: v.jobId,
        // Re-checked against the database, not this board's cached rows: a crew may have
        // clocked in since the last refresh.
        onlyIfNotStarted: true,
      })));
      const skipped = started.length + notDispatched.length;
      toast.success(
        `${cancellable.length} stop${cancellable.length !== 1 ? "s" : ""} back to scheduled` +
        (started.length > 0 ? ` — ${started.length} already started, left as is` : "") +
        (skipped > started.length ? ` (${notDispatched.length} weren't dispatched)` : "")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel dispatch failed");
    }
  }

  function exportStops() {
    const rows = filteredVisits.map((v) => ({
      visit: v,
      service: visitServiceName(v),
      crew: crewNameOf(v) ?? "",
      amountCents: amountByVisitId.get(v.id) ?? null,
    }));
    downloadCsv(`snow-stops-${activeEvent?.eventDate ?? "export"}.csv`, buildSnowStopsCsv(rows));
    toast.success(`Exported ${rows.length} stop${rows.length !== 1 ? "s" : ""}`);
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

  const [reordering, setReordering] = useState(false);

  /** Writes order_num for every visit whose position in `orderedIds` changed. */
  async function persistOrder(orderedIds: string[]) {
    const byId = new Map(visits.map((v) => [v.id, v]));
    const changes = orderedIds
      .map((id, i) => ({ id, i, v: byId.get(id) }))
      .filter((x) => x.v && x.v.orderNum !== x.i);
    await Promise.all(changes.map((x) => updateVisitMutation({ id: x.id, updates: { order_num: x.i }, jobId: x.v!.jobId })));
  }

  async function saveOrderToMasterRoutes() {
    if (!effectiveEventId) return;
    try {
      const n = await saveOrderToRoutes(effectiveEventId);
      toast.success(`Saved the order of ${n} stop${n === 1 ? "" : "s"} to the Master Routes. Future storms will start in this order.`);
    } catch {
      toast.error("Failed to save the order to the Master Routes");
    }
  }

  async function moveStop(v: CRMJobVisit, dir: -1 | 1) {
    // Each tap swaps against the order on the server; a second tap before the refetch
    // swapped from a stale order and undid the first.
    if (reordering) return;
    const crewKey = effectiveCrewIdOf(v) ?? "none";
    // Only stops of the same crew on the same day swap places.
    const group = filteredVisits.filter((x) => (effectiveCrewIdOf(x) ?? "none") === crewKey && x.scheduledDate === v.scheduledDate);
    const idx = group.findIndex((x) => x.id === v.id);
    const neighbor = group[idx + dir];
    if (!neighbor) return;
    const ids = visits.map((x) => x.id);
    const a = ids.indexOf(v.id);
    const b = ids.indexOf(neighbor.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    setDriveMins(new Map());
    setReordering(true);
    try { await persistOrder(ids); } catch { toast.error("Failed to reorder"); } finally { setReordering(false); }
  }

  /** Moves stops to another day (a storm that runs several days has stops on different days). Completed and
   *  cancelled stops stay put. Returns how many moved and the first reason any refused (e.g. a crew is clocked in). */
  async function moveVisitsToDate(visitIds: string[], date: string): Promise<{ moved: number; skipped: number; error: string | null }> {
    const targets = visitIds
      .map((id) => visits.find((x) => x.id === id))
      .filter((v): v is CRMJobVisit => !!v && v.status !== "completed" && v.status !== "cancelled" && v.scheduledDate !== date);
    const results = await Promise.allSettled(targets.map((v) => updateVisitMutation({ id: v.id, updates: { scheduled_date: date }, jobId: v.jobId })));
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    setDriveMins(new Map());
    return {
      moved: results.length - failed.length,
      skipped: visitIds.length - targets.length,
      error: failed[0] ? (failed[0].reason instanceof Error ? failed[0].reason.message : "Failed to move") : null,
    };
  }

  async function moveToDate(visitIds: string[], date: string) {
    if (!date) return;
    const r = await moveVisitsToDate(visitIds, date);
    if (r.error) toast.warning(`${r.moved} moved. ${r.error}`);
    else if (r.moved === 0) toast.info("Nothing to move — those stops are already on that date or are finished.");
    else toast.success(`${r.moved} stop${r.moved > 1 ? "s" : ""} moved to ${shortDateLabel(date)}${r.skipped ? ` (${r.skipped} left as is)` : ""}`);
    if (r.moved > 0) setMoveDate("");
  }

  async function saveVisitDate(id: string, date: string) {
    const r = await moveVisitsToDate([id], date);
    if (r.error) { toast.error(r.error); throw new Error(r.error); }
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
    // One route per crew per day (a multi-day storm has a route for each day).
    const byCrew = new Map<string, CRMJobVisit[]>();
    const crewOfKey = new Map<string, string>();
    for (const v of pool) {
      const crewId = effectiveCrewIdOf(v);
      if (!crewId) continue;
      const key = `${crewId}|${v.scheduledDate ?? ""}`;
      crewOfKey.set(key, crewId);
      if (!byCrew.has(key)) byCrew.set(key, []);
      byCrew.get(key)!.push(v);
    }
    const routable = [...byCrew.entries()].filter(([, list]) => list.length >= 2);
    if (routable.length === 0) {
      toast.error("Each crew needs at least 2 stops with an address to optimize — assign crews first.");
      return;
    }
    setOptimizing(true);
    try {
      const results = await Promise.all(routable.map(async ([crewId, list]) => {
        const apiCrewId = crewOfKey.get(crewId) ?? crewId;
        try {
          const res = await fetch("/api/crm/route-optimize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visitIds: list.map((v) => v.id), strategy: routeStrategy, crewId: apiCrewId }),
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
        const key = crewId ? `${crewId}|${v.scheduledDate ?? ""}` : "";
        if (!crewId || !members.get(key)?.has(v.id)) return v.id;
        const ptr = pointers.get(key) ?? 0;
        pointers.set(key, ptr + 1);
        return queues.get(key)![ptr] ?? v.id;
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
            {events.filter((e) => showInactiveEvents || e.isActive || e.id === effectiveEventId).map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name} — {e.eventDate}{e.isActive ? "" : " (inactive)"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {inactiveEventCount > 0 && (
          <button
            type="button"
            onClick={() => setShowInactiveEvents((v) => !v)}
            className="text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            {showInactiveEvents ? "Hide" : "Show"} {inactiveEventCount} inactive
          </button>
        )}
        {canManage && (
          <Button size="sm" variant="outline" className="h-9 max-lg:h-11 text-xs gap-1.5" onClick={() => setNewEventOpen(true)}>
            <Plus className="h-3.5 w-3.5" />New Storm Event
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-9 max-lg:h-11 text-xs gap-1.5" onClick={() => setRoutesOpen(true)}>
          <RouteIcon className="h-3.5 w-3.5" />Master Routes
        </Button>
        <MasterRoutesDialog open={routesOpen} onOpenChange={setRoutesOpen} />

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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void toggleEventActive()}>
                    {activeEvent.isActive ? "Mark storm inactive" : "Mark storm active"}
                  </DropdownMenuItem>
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
          {canManage && (
            // A Complete storm takes no new stops: set it back to Working first.
            <Button
              size="sm"
              className="h-9 max-lg:h-11 text-xs gap-1.5"
              onClick={() => setAddJobsOpen(true)}
              disabled={!activeEvent || stormComplete}
              title={stormComplete ? "This storm is Complete — set it back to Working to add jobs" : undefined}
            >
              <Plus className="h-3.5 w-3.5" />Add Jobs
            </Button>
          )}
        </div>
      </div>

      {/* Select a Filter strip — ABOVE the dark bar, like the Dispatch Board: value filters on the left,
          Stats / Map / Optimize / Export / Print on the right. */}
      {activeEvent && (
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 border-b bg-card px-4 py-2 shrink-0">
          <span className="mr-1 shrink-0 text-xs font-medium text-muted-foreground">Select a Filter:</span>
          <div className="flex flex-wrap items-center gap-1">
            <FilterPill label="Client" options={clientOptions} selected={clientFilters} onChange={setClientFilters} format={(id) => clientNameById.get(id) ?? id} searchable />
            <FilterPill label="Date" options={dateOptions} selected={dateFilters} onChange={setDateFilters} format={(d) => (d === "—" ? d : `${shortDateLabel(d)}  ${d}`)} />
            <FilterPill label="Service" options={serviceOptions} selected={serviceFilters} onChange={setServiceFilters} />
            <FilterPill label="City" options={cityOptions} selected={cityFilters} onChange={setCityFilters} />
            <FilterPill label="Zip" options={zipOptions} selected={zipFilters} onChange={setZipFilters} />
          </div>
          <div className="ml-auto flex max-w-full flex-wrap items-center gap-1.5 max-lg:w-full max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:overscroll-x-contain max-lg:pb-1 max-lg:[&>*]:shrink-0">
            <Button
              size="sm" variant="outline"
              className={cn("h-7 max-lg:h-10 gap-1.5 px-2.5 text-xs", statsOpen && "border-brand-400 text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30")}
              onClick={() => setStatsOpen((o) => !o)}
              title="Show crew stats"
            >
              <BarChart3 className="h-3.5 w-3.5" />Stats
            </Button>
            <Button
              size="sm" variant="outline"
              className={cn("h-7 max-lg:h-10 gap-1.5 px-2.5 text-xs", mapOpen && "border-brand-400 text-brand-700 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30")}
              onClick={() => setMapOpen((o) => !o)}
              title="Show the stops on a map"
            >
              <MapPin className="h-3.5 w-3.5" />Map
            </Button>
            {canManage && (
              <>
                <Select value={routeStrategy} onValueChange={(v) => setRouteStrategy(v as typeof routeStrategy)}>
                  <SelectTrigger className="h-7 max-lg:h-10 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nearest_first">Nearest first</SelectItem>
                    <SelectItem value="furthest_first">Furthest first</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm" variant="outline"
                  className="h-7 max-lg:h-10 gap-1.5 px-2.5 text-xs"
                  onClick={() => void optimizeRoutes()}
                  disabled={optimizing || visits.length < 2}
                  title="Order each crew's stops by driving time (selected stops only, if any are selected)"
                >
                  <RouteIcon className="h-3.5 w-3.5" />{optimizing ? "Optimizing…" : "Optimize"}
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" className="h-7 max-lg:h-10 gap-1.5 px-2.5 text-xs" onClick={exportStops} disabled={filteredVisits.length === 0}>
              <Download className="h-3.5 w-3.5" />Export
            </Button>
            <Button size="sm" variant="outline" className="h-7 max-lg:h-10 gap-1.5 px-2.5 text-xs" onClick={() => setPrintOpen(true)}>
              <Printer className="h-3.5 w-3.5" />Print
            </Button>
          </div>
        </div>
      )}

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

          <Popover>
            <PopoverTrigger asChild>
              <button className="h-7 max-lg:h-9 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
                <Tag className="h-3 w-3" />
                {tagFilters.length === 0 ? "All Tags" : `${tagFilters.length} Tag${tagFilters.length > 1 ? "s" : ""}`}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 max-h-72 overflow-y-auto p-1" align="start">
              <FilterOptionRow checked={tagFilters.length === 0} onToggle={() => setTagFilters([])}>All Tags</FilterOptionRow>
              {orgTags.length === 0 && <p className="px-2 py-1.5 text-[11px] text-slate-400 dark:text-neutral-500">No client tags yet</p>}
              {orgTags.map((tag) => (
                <FilterOptionRow
                  key={tag}
                  checked={tagFilters.includes(tag)}
                  onToggle={() => setTagFilters((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]))}
                >
                  <span className="truncate">{tag}</span>
                </FilterOptionRow>
              ))}
            </PopoverContent>
          </Popover>

          <ValueFilter label="Priorities" options={["high", "normal", "low", "none"]} selected={priorityFilters} onChange={setPriorityFilters} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "h-7 max-lg:h-9 flex items-center gap-1.5 rounded border px-2.5 text-[10px] transition-colors",
                  selectedVisitIds.size > 0
                    ? "bg-brand-600 border-brand-500 text-white hover:bg-brand-700 font-medium"
                    : "bg-[#5a5a5a] border-[#6a6a6a] text-slate-200 hover:text-white"
                )}
              >
                <ListChecks className="h-3 w-3" />
                Actions{selectedVisitIds.size > 0 ? ` (${selectedVisitIds.size})` : ""}
                <ChevronDown className="h-2.5 w-2.5 opacity-60" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem className="text-xs" onSelect={toggleSelectAllShown} disabled={filteredVisits.length === 0}>
                <ListChecks className={MENU_ICON} />{allShownSelected ? "Unselect All Shown" : "Select All Shown"}
              </DropdownMenuItem>
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger className="text-xs">
                      <CheckCircle2 className={MENU_ICON} />Change Status
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem className="text-xs" onSelect={() => void dispatchVisits(selectedVisitIds.size > 0 ? [...selectedVisitIds] : null)}>
                        <Smartphone className={MENU_ICON} />{selectedVisitIds.size > 0 ? "Dispatch Selected" : "Dispatch All Assigned"}
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs" disabled={selectedVisitIds.size === 0} onSelect={() => void cancelDispatch([...selectedVisitIds])}>
                        <Undo2 className={MENU_ICON} />Cancel Dispatch
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs" disabled={selectedVisitIds.size === 0} onSelect={() => setCloseOutIds(new Set(selectedVisitIds))}>
                        <CheckCircle2 className={MENU_ICON} />Close Out Selected…
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs" disabled={selectedVisitIds.size === 0} onSelect={() => setOutcomeDialog({ ids: [...selectedVisitIds], status: "skipped" })}>
                        <SkipForward className={MENU_ICON} />Skip Selected…
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs" disabled={selectedVisitIds.size === 0} onSelect={() => setOutcomeDialog({ ids: [...selectedVisitIds], status: "cancelled" })}>
                        <XCircle className={MENU_ICON} />Cancel Selected…
                      </DropdownMenuItem>
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem className="text-xs" onSelect={() => setCrewAssignOpen(true)}>
                    <Users className={MENU_ICON} />Team Assign…
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onSelect={() => void optimizeRoutes()} disabled={optimizing || visits.length < 2}>
                    <RouteIcon className={MENU_ICON} />{selectedVisitIds.size > 0 ? "Optimize Selected Routes" : "Optimize Routes"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onSelect={() => void saveOrderToMasterRoutes()} disabled={savingOrder || visits.length === 0}>
                    <RouteIcon className={MENU_ICON} />Save Order to Master Routes
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {canEmailClients && (
                <DropdownMenuItem className="text-xs" disabled={selectedVisitIds.size === 0} onSelect={() => setMessageChannel("email")}>
                  <Mail className={MENU_ICON} />Email Clients…
                </DropdownMenuItem>
              )}
              {canTextClients && (
                <DropdownMenuItem className="text-xs" disabled={selectedVisitIds.size === 0} onSelect={() => setMessageChannel("sms")}>
                  <MessageSquare className={MENU_ICON} />Text Clients…
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-xs" disabled={filteredVisits.length === 0} onSelect={() => setNoEmailOpen(true)}>
                <Mail className={MENU_ICON} />Jobs Without Emails…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-xs" onSelect={() => setStatsOpen((o) => !o)}>
                <BarChart3 className={MENU_ICON} />{statsOpen ? "Hide Crew Stats" : "Show Crew Stats"}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onSelect={() => setPrintOpen(true)}>
                <Printer className={MENU_ICON} />Print Route Sheets…
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" disabled={filteredVisits.length === 0} onSelect={exportStops}>
                <Download className={MENU_ICON} />Export Stops (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem className="text-xs" onSelect={() => { setSearch(""); setCrewFilters([]); setStatusFilter("all"); setServiceFilters([]); setPriorityFilters([]); setCityFilters([]); setZipFilters([]); setDateFilters([]); setClientFilters([]); setTagFilters([]); setSelectedVisitIds(new Set()); }}>
                <Eraser className={MENU_ICON} />Clear Filters &amp; Selection
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
              onClick={() => setLegendOpen(true)}
              title="Show Legend"
              className="h-7 max-lg:h-9 flex items-center gap-1.5 rounded border border-[#6a6a6a] bg-[#5a5a5a] px-2.5 text-[10px] text-slate-200 transition-colors hover:text-white"
            >
              <HelpCircle className="h-3 w-3" />Legend
            </button>
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
            <SnowWorkMap
              apiKey={orgSettings.googleMapsApiKey}
              stops={filteredVisits.map((v): SnowMapStop => {
                const crewId = effectiveCrewIdOf(v);
                return {
                  visitId: v.id,
                  jobId: v.jobId,
                  order: stopNumberById.get(v.id) ?? 0,
                  clientName: v.clientName ?? "Unknown client",
                  address: [v.job?.serviceAddress, v.job?.serviceCity].filter(Boolean).join(", "),
                  serviceName: visitServiceName(v),
                  crewKey: crewId ?? "__none__",
                  crewLabel: (crewId && crewNameById.get(crewId)) || "Unassigned",
                  status: v.status,
                  priority: v.clientPriority ?? null,
                  amountCents: amountByVisitId.get(v.id) ?? 0,
                  budgetedHours: v.budgetedHours ?? 0,
                  date: v.scheduledDate ?? null,
                  lat: v.job?.lat ?? null,
                  lng: v.job?.lng ?? null,
                };
              })}
              selectedIds={selectedVisitIds}
              canManage={canManage}
              crews={crews}
              tableOnlySelected={tableOnlySelected}
              reordering={reordering}
              onToggle={toggleSelect}
              onSelectMany={(ids) => setSelectedVisitIds((prev) => new Set([...prev, ...ids]))}
              onSelectOnly={(ids) => setSelectedVisitIds(new Set(ids))}
              onClearSelection={() => { setSelectedVisitIds(new Set()); setTableOnlySelected(false); }}
              onMoveStop={(id, dir) => { const v = visits.find((x) => x.id === id); if (v) void moveStop(v, dir); }}
              onAssignCrew={changeCrew}
              onDispatch={(ids) => dispatchVisits(ids)}
              onOpenMultiCrew={() => setMultiCrewOpen(true)}
              onMoveToDate={moveToDate}
              onTableOnlySelected={setTableOnlySelected}
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
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMultiCrewOpen(true)}>
                <Users className="mr-1 h-3 w-3" />Assign crews…
              </Button>
              <div className="flex items-center gap-1">
                <Input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} className="h-7 w-36 text-xs" aria-label="Move selected stops to date" />
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!moveDate} onClick={() => void moveToDate([...selectedVisitIds], moveDate)}>Move to date</Button>
              </div>
              <Button size="sm" className="h-7 text-xs" onClick={() => setCloseOutIds(new Set(selectedVisitIds))}>
                Close Out…
              </Button>
            </>
          )}
          {canEmailClients && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMessageChannel("email")}>Email clients…</Button>
          )}
          {canTextClients && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setMessageChannel("sms")}>Text clients…</Button>
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
                <th className="w-8 px-2 py-2.5">
                  <Checkbox
                    checked={allShownSelected ? true : someShownSelected ? "indeterminate" : false}
                    onCheckedChange={toggleSelectAllShown}
                    disabled={filteredVisits.length === 0}
                    aria-label="Select all shown stops"
                    className="h-3.5 w-3.5"
                  />
                </th>
                <th className="w-12 px-2 py-2.5">#</th>
                <th className="w-8 px-2 py-2.5">St</th>
                <th className="min-w-[140px] px-2 py-2.5 max-lg:sticky max-lg:left-0 max-lg:z-20 max-lg:bg-slate-50 dark:max-lg:bg-muted/40 max-lg:shadow-[1px_0_0_rgb(226_232_240)]">Client</th>
                {isVisible("date") && <th className="px-2 py-2.5">Date</th>}
                {isVisible("service") && <th className="px-2 py-2.5">Service</th>}
                {isVisible("address") && <th className="px-2 py-2.5">Address</th>}
                {isVisible("city") && <th className="px-2 py-2.5">City</th>}
                {isVisible("state") && <th className="px-2 py-2.5">State</th>}
                {isVisible("zip") && <th className="px-2 py-2.5">Zip</th>}
                {isVisible("priority") && <th className="px-2 py-2.5">Priority</th>}
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
                              <button type="button" title="Move up in route" className="text-slate-300 hover:text-slate-600 dark:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-40" disabled={reordering} onClick={() => void moveStop(v, -1)}><ArrowUp className="h-3 w-3" /></button>
                              <button type="button" title="Move down in route" className="text-slate-300 hover:text-slate-600 dark:text-neutral-600 dark:hover:text-neutral-300 disabled:opacity-40" disabled={reordering} onClick={() => void moveStop(v, 1)}><ArrowDown className="h-3 w-3" /></button>
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
                        {(v.pushNumber ?? 1) > 1 && (
                          <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[9px]">Push {v.pushNumber}</Badge>
                        )}
                        {capFlags?.get(v.jobId)?.over && v.status !== "completed" && v.status !== "skipped" && v.status !== "cancelled" && (
                          <Badge variant="outline" className="ml-1.5 border-amber-300 px-1.5 py-0 text-[9px] text-amber-700 dark:border-amber-700 dark:text-amber-400" title={`${capFlags.get(v.jobId)!.label} — this stop bills as overage, not under the contract price`}>
                            Overage
                          </Badge>
                        )}
                        {v.handedOffFromCrewId && (
                          <Badge variant="outline" className="ml-1.5 border-amber-300 px-1.5 py-0 text-[9px] text-amber-700 dark:border-amber-700 dark:text-amber-400" title={`The crew app handed this stop off from ${crewNameById.get(v.handedOffFromCrewId) ?? "another crew"} — they couldn't make it`}>
                            Handed off from {crewNameById.get(v.handedOffFromCrewId) ?? "another crew"}
                          </Badge>
                        )}
                        {v.crewGroupId && (
                          <Badge variant="outline" className="ml-1.5 px-1.5 py-0 text-[9px]" title={v.crewGroupSecondary ? "Extra crew on this stop — the lead crew's visit carries the charge" : "Lead crew on a stop with more than one crew — bills the stop"}>
                            {v.crewGroupSecondary ? "Extra crew" : "Lead"}
                          </Badge>
                        )}
                        {canManage && !stormComplete && latestPushVisitIdByJob.get(v.jobId) === v.id && (
                          isFlatPerEvent(v) ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  title="Another visit to this site on this storm"
                                  disabled={addingPush}
                                  className="ml-1.5 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 max-lg:py-1.5"
                                >
                                  <Plus className="h-2.5 w-2.5" />Add push<ChevronDown className="h-2.5 w-2.5 opacity-60" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="w-64">
                                <DropdownMenuItem onSelect={() => void addPush(v, false)}>
                                  No charge — record the visit only
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => void addPush(v, true)}>
                                  Bill it — its own charge (e.g. a second salting)
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : (
                            <button
                              type="button"
                              title={v.job?.invoiceType === "per_event_per_inch" ? "Add another visit on this storm — part of the event: its depth counts toward the storm's deepest reading, no separate charge" : "Add another push for this job on this storm — billed on its own depth"}
                              disabled={addingPush}
                              onClick={() => void addPush(v)}
                              className="ml-1.5 inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 max-lg:py-1.5"
                            >
                              <Plus className="h-2.5 w-2.5" />Add push
                            </button>
                          )
                        )}
                        {(v.pushNumber ?? 1) > 1 && isFlatPerEvent(v) && !v.crewGroupSecondary && (
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => void updateVisitMutation({ id: v.id, updates: { bill_push: !v.billPush }, jobId: v.jobId }).catch(() => toast.error("Failed to change billing"))}
                            title={v.billPush ? "Billed as its own charge — click to make it no charge" : "No charge (the storm's first push carries the price) — click to bill it"}
                            className={cn("ml-1.5 rounded border px-1.5 py-0 text-[9px] disabled:opacity-60", v.billPush ? "border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}
                          >
                            {v.billPush ? "Billed" : "No charge"}
                          </button>
                        )}
                      </td>
                      {isVisible("date") && (
                        <td className="px-2 py-2 text-muted-foreground whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <VisitDateCell visit={v} canEdit={canManage} onSave={saveVisitDate} />
                        </td>
                      )}
                      {isVisible("service") && <td className="px-2 py-2 text-muted-foreground">{visitServiceName(v)}</td>}
                      {isVisible("address") && <td className="px-2 py-2 text-muted-foreground">{v.job?.serviceAddress ?? "—"}</td>}
                      {isVisible("city") && <td className="px-2 py-2 text-muted-foreground">{v.job?.serviceCity ?? "—"}</td>}
                      {isVisible("state") && <td className="px-2 py-2 text-muted-foreground">{v.job?.serviceState ?? "—"}</td>}
                      {isVisible("zip") && <td className="px-2 py-2 text-muted-foreground">{v.job?.serviceZip ?? "—"}</td>}
                      {isVisible("priority") && <td className="px-2 py-2 text-muted-foreground capitalize">{v.clientPriority ?? "—"}</td>}
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
            key={activeEvent.id}
            open={addJobsOpen}
            onOpenChange={setAddJobsOpen}
            stormEventId={activeEvent.id}
            eventDate={activeEvent.eventDate}
            forecastDepthInches={activeEvent.forecastDepthInches}
            onDone={() => void refetchVisits()}
          />
          <SnowLegendDialog open={legendOpen} onOpenChange={setLegendOpen} />
          <BulkMultiCrewDialog
            key={multiCrewOpen ? "open" : "closed"}
            open={multiCrewOpen}
            onOpenChange={setMultiCrewOpen}
            visits={visits.filter((v) => selectedVisitIds.has(v.id))}
            allVisits={visits}
            crews={crews}
            resolveCrewId={effectiveCrewIdOf}
            onDone={() => { setSelectedVisitIds(new Set()); setDriveMins(new Map()); }}
          />
          {messageChannel && (
            <SnowMessageDialog
              open
              onClose={() => setMessageChannel(null)}
              initialChannel={messageChannel}
              visits={selectedStops}
              event={activeEvent}
              crewNameOf={crewNameOf}
            />
          )}
          {noEmailOpen && (
            <SnowNoEmailDialog
              open
              onClose={() => setNoEmailOpen(false)}
              visits={selectedStops.length > 0 ? selectedStops : filteredVisits}
              scopeLabel={selectedStops.length > 0 ? "selected" : "shown"}
            />
          )}
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
