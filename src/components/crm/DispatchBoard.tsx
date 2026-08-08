"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { ColumnChooser } from "@/components/shared/ColumnChooser";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  useVisitsForDate,
  useUpdateVisitStatus,
  useUpdateVisit,
  useCRMCrews,
  useCRMJobProducts,
} from "@/lib/hooks/use-crm-jobs";
import { useCreateInvoiceFromJob } from "@/lib/hooks/use-invoices";
import { WeekStrip } from "./WeekStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { AuditTrailTab } from "@/components/shared/AuditTrailTab";
import { AttachmentsSection } from "@/components/shared/AttachmentsSection";
import { VisitStatusIcon } from "@/components/shared/VisitStatusIcon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency, cn, relativeTime, formatDateShort } from "@/lib/utils";
import { computeActualHours, computeBudgetedHours } from "@/lib/utils/visit-hours";
import { toast } from "sonner";
import {
  Calendar,
  Smartphone,
  FileText,
  Users,
  Search,
  MapPin,
  BarChart3,
  Columns3,
  Route,
  RefreshCw,
  X as XIcon,
  GripVertical,
  ListChecks,
  ChevronDown,
  ArrowUpDown,
  Download,
  Phone,
  PhoneCall,
  Printer,
  StickyNote,
  Package,
  FlaskConical,
  MessageSquareText,
  Clock,
} from "lucide-react";
import { ChemicalTrackingWizard } from "@/components/crm/chemical/ChemicalTrackingWizard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CRMJobVisit, VisitStatus, JobComment, CrewMemberTime } from "@/types/crm-jobs";
import { useCrews, useCrewDailyMembers, useSetCrewDailyMember, useClearCrewDailyMember, useEmployees, useAddCrewMember } from "@/lib/hooks/use-employees";
import { useCRMServices, useCreateVisit } from "@/lib/hooks/use-crm-jobs";
import { useNearbyWaitingListJobs } from "@/lib/hooks/use-nearby-waiting-list";
import { groupVisitsIntoStops } from "@/lib/utils/visit-stops";
import { stripHtml } from "@/lib/utils/strip-html";

// ── status icon ───────────────────────────────────────────────────────────────

const STATUS_CYCLE: VisitStatus[] = ["scheduled", "dispatched", "in_progress", "completed", "skipped"];
// Stable empty-array reference for visits with no per-member time rows — avoids
// handing VisitRow a fresh [] every render, which would otherwise defeat any
// memoization keyed on this array's identity.
const EMPTY_MEMBER_TIMES: CrewMemberTime[] = [];

// Formats a "HH:MM" / "HH:MM:SS" 24h time string (the shape a native
// <input type="time"> value/DB `time` column uses) into "3:00 PM" for
// read-only display.
function formatTimeShort(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// How many people are actually on a crew for a given day — the crew's default
// roster (crm_crew_members), with any same-day-only reassignments from the
// Team Assignment dialog (crm_crew_daily_members) applied on top. Shared by
// anything that needs to allocate a headcount from the day's real roster
// instead of a job's own possibly-stale men_count.
function effectiveCrewSize(
  crewId: string | null,
  richCrews: { id: string; members?: { id: string; crewId?: string }[] }[],
  dailyOverrides: { member_id: string; crew_id: string }[]
): number {
  if (!crewId) return 0;
  const defaultCrewByMember = new Map<string, string>();
  richCrews.forEach((c) => (c.members ?? []).forEach((m) => defaultCrewByMember.set(m.id, c.id)));
  const overrideCrewByMember = new Map(dailyOverrides.map((o) => [o.member_id, o.crew_id]));
  const allMembers = richCrews.flatMap((c) => c.members ?? []);
  return allMembers.filter((m) => (overrideCrewByMember.get(m.id) ?? defaultCrewByMember.get(m.id)) === crewId).length;
}

// Same roster resolution as effectiveCrewSize, but returning the member ids
// themselves — used to know exactly WHO a Start/End correction on the board
// row should be written down to in crm_crew_member_times.
function effectiveCrewMemberIds(
  crewId: string | null,
  richCrews: { id: string; members?: { id: string; crewId?: string }[] }[],
  dailyOverrides: { member_id: string; crew_id: string }[]
): string[] {
  if (!crewId) return [];
  const defaultCrewByMember = new Map<string, string>();
  richCrews.forEach((c) => (c.members ?? []).forEach((m) => defaultCrewByMember.set(m.id, c.id)));
  const overrideCrewByMember = new Map(dailyOverrides.map((o) => [o.member_id, o.crew_id]));
  const allMembers = richCrews.flatMap((c) => c.members ?? []);
  return allMembers
    .filter((m) => (overrideCrewByMember.get(m.id) ?? defaultCrewByMember.get(m.id)) === crewId)
    .map((m) => m.id);
}

function StatusCycleButton({ visit }: { visit: CRMJobVisit }) {
  const { mutateAsync: updateStatus, isPending } = useUpdateVisitStatus();

  async function cycle(e: React.MouseEvent) {
    e.stopPropagation();
    const i = STATUS_CYCLE.indexOf(visit.status);
    const next = STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
    try {
      await updateStatus({ id: visit.id, status: next, jobId: visit.jobId, jobType: visit.job?.jobType });
    } catch {
      toast.error("Failed to update status");
    }
  }

  return (
    <button
      onClick={cycle}
      disabled={isPending}
      title={visit.status}
      className={cn("flex items-center justify-center rounded transition-opacity", isPending && "opacity-50")}
    >
      <VisitStatusIcon status={visit.status} />
    </button>
  );
}

// ── column visibility ─────────────────────────────────────────────────────────

type ColKey = "service" | "date" | "city" | "zip" | "assigned" | "last_svc" | "start" | "end" | "b_hrs" | "actual" | "variance" | "men" | "qty" | "rate" | "amt" | "icons";

const COL_DEFS: { key: ColKey; label: string }[] = [
  { key: "service",  label: "Service" },
  { key: "date",     label: "Date" },
  { key: "city",     label: "City" },
  { key: "zip",      label: "Zip" },
  { key: "assigned", label: "Assigned" },
  { key: "last_svc", label: "Last Svc" },
  { key: "start",    label: "Start" },
  { key: "end",      label: "End" },
  { key: "b_hrs",    label: "B Hrs" },
  { key: "actual",   label: "Actual Hrs" },
  { key: "variance", label: "Hr Variance" },
  { key: "men",      label: "Men" },
  { key: "qty",      label: "Qty" },
  { key: "rate",     label: "Rate" },
  { key: "amt",      label: "Amount" },
  { key: "icons",    label: "Notes/Icons" },
];

// ── job detail sheet ──────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: VisitStatus; label: string }[] = [
  { value: "scheduled",   label: "Pending" },
  { value: "dispatched",  label: "Dispatched" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "cancelled",   label: "Cancelled" },
  { value: "skipped",     label: "Skipped" },
];

const SUB_STATUS_OPTIONS = [
  "At Property", "En Route", "On Hold", "Waiting for Parts", "Needs Follow-up",
];

function JobDetailSheet({
  visit,
  open,
  onOpenChange,
  crews,
  onEditTimes,
  memberTimes,
  anchorVisitId,
}: {
  visit: CRMJobVisit;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  crews: { id: string; name: string }[];
  onEditTimes: (v: CRMJobVisit) => void;
  /** Same per-member punch records the row uses — see VisitRow for why. */
  memberTimes: CrewMemberTime[];
  /** The stop's anchor visit id — see EditJobTimesDialog for why member-time
   * writes must target this instead of visit.id. */
  anchorVisitId: string;
}) {
  const { mutateAsync: updateVisit, isPending } = useUpdateVisit();
  const router = useRouter();
  const { mutateAsync: createInvoice, isPending: invoicing } = useCreateInvoiceFromJob();

  const job  = visit.job;
  const services = job?.services ?? [];
  // Package jobs carry every step (e.g. all 5 Fert applications) on job.services,
  // but a given visit is only for the ONE step it's linked to — show just that,
  // not every step on the whole package.
  const linkedService = visit.jobServiceId ? services.find((s) => s.id === visit.jobServiceId) : null;
  const { data: jobProducts = [] } = useCRMJobProducts(visit.jobId);
  const serviceName = linkedService
    ? linkedService.serviceName
    : services.length > 0
      ? services.map((s) => s.serviceName).join(", ")
      : "Service Visit";
  // What invoices will actually show if the visit/job-level override below is left
  // blank — each relevant service's own invoice description (set in Services
  // settings), falling back to its plain name.
  const servicesForDescPreview = linkedService ? [linkedService] : services;
  const serviceInvoiceDescPreview = servicesForDescPreview
    .map((s) => stripHtml(s.serviceInvoiceDescription || s.serviceName || ""))
    .filter(Boolean)
    .join(", ");

  // Service total as fallback when neither visit nor job has an explicit rate
  const serviceTotal = linkedService
    ? (linkedService.rateCents ?? 0) * (linkedService.qty ?? 1)
    : services.reduce((s, svc) => s + (svc.rateCents ?? 0) * (svc.qty ?? 1), 0);
  // job.rateCents is one shared value for the whole job — only a sensible
  // fallback for a visit covering the whole job. Once a visit is linked to
  // ONE specific service (a multi-service job split across visits), it must
  // use that service's own rate instead, or every visit on the job would
  // show the same job-level amount regardless of which service it's for.
  const rateFallbackCents = linkedService
    ? (serviceTotal || null)
    : (job?.rateCents ?? (serviceTotal > 0 ? serviceTotal : null));

  // Form state — reset when visit changes
  const [status,      setStatus]      = useState<VisitStatus>(visit.status);
  const [subStatus,   setSubStatus]   = useState(visit.subStatus ?? "");
  const [crewId,      setCrewId]      = useState(visit.crewId ?? job?.crewId ?? "");
  const [startTime,   setStartTime]   = useState(visit.startTime ?? "");
  const [endTime,     setEndTime]     = useState(visit.endTime ?? "");
  // Same fallback the dispatch board row uses (computeActualHours) — an
  // explicit visit.actualHours override if one's been set, else derived from
  // clock-in/out or Start/End × men. Reading visit.actualHours directly here
  // showed 0/blank whenever there was no explicit override, even when the
  // row was correctly showing a computed value from real times.
  const [actualHours, setActualHours] = useState(String(computeActualHours(visit) ?? ""));
  const [menCount,    setMenCount]    = useState(String(visit.menCount));
  const [budgetedHoursInput, setBudgetedHoursInput] = useState(String(computeBudgetedHours(visit) ?? ""));
  const [qty,         setQty]         = useState(String(visit.qty ?? ""));
  const [rateCents,   setRateCents]   = useState(
    String(visit.rateCents != null ? visit.rateCents / 100
         : rateFallbackCents != null ? rateFallbackCents / 100
         : "")
  );

  // Sync crewId when the visit prop updates (e.g. after drag-assign or propagate)
  useEffect(() => { setCrewId(visit.crewId ?? job?.crewId ?? ""); }, [visit.id, visit.crewId, job?.crewId]);
  // Same for Start/End — otherwise an edit made elsewhere (e.g. the dispatch
  // board row's own inline Start/End inputs) never shows up here.
  useEffect(() => { setStartTime(visit.startTime ?? ""); }, [visit.id, visit.startTime]);
  useEffect(() => { setEndTime(visit.endTime ?? ""); }, [visit.id, visit.endTime]);
  // Same reasoning as the dispatch board row: only mount the actual native
  // time input while actively editing, so an unset field never sits around
  // in its browser-dependent "empty" rendering (which can show real-looking
  // digits like 12:30 instead of blank on some platforms).
  const [editingAppointmentStart, setEditingAppointmentStart] = useState(false);
  const [editingAppointmentEnd,   setEditingAppointmentEnd]   = useState(false);
  // See the row's identical startTouched/endTouched — a native time input
  // with hour+minute typed but no AM/PM chosen reports empty, same as never
  // having typed anything, so warn rather than silently no-op.
  const [appointmentStartTouched, setAppointmentStartTouched] = useState(false);
  const [appointmentEndTouched,   setAppointmentEndTouched]   = useState(false);
  const appointmentEndButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setBudgetedHoursInput(String(computeBudgetedHours(visit) ?? ""));
  }, [visit.id, visit.budgetedHours, job?.budgetedHours]);
  useEffect(() => {
    setActualHours(String(computeActualHours(visit) ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visit.id, visit.actualHours, visit.startTime, visit.endTime, visit.clockedInAt, visit.clockedOutAt, visit.menCount]);

  // Same divergence detection and crew-member feed-down as the dispatch board
  // row (see VisitRow) — kept in sync here so a dispatcher fixing a time from
  // the slideover gets identical behavior to fixing it from the row.
  const { data: richCrewsForSheet } = useCrews(false);
  const { data: dailyOverridesForSheet = [] } = useCrewDailyMembers(visit.scheduledDate);
  const upsertMemberTimeForSheet = useUpsertCrewMemberTime();
  const distinctInsForSheet  = new Set(memberTimes.map((t) => t.clockedInAt).filter((v): v is string => !!v));
  const distinctOutsForSheet = new Set(memberTimes.map((t) => t.clockedOutAt).filter((v): v is string => !!v));
  const startHasMultipleTimes = distinctInsForSheet.size > 1;
  const endHasMultipleTimes   = distinctOutsForSheet.size > 1;
  // Same real-punch-vs-displayed divergence check as the row — see VisitRow's
  // startPunchDiffers comment for why this is the one case worth surfacing.
  const startClockTime = isoToDateAndTime(visit.clockedInAt, visit.scheduledDate).time;
  const endClockTime   = isoToDateAndTime(visit.clockedOutAt, visit.scheduledDate).time;
  const startPunchDiffers = startClockTime !== "" && startClockTime !== (startTime || "").slice(0, 5);
  const endPunchDiffers   = endClockTime   !== "" && endClockTime   !== (endTime   || "").slice(0, 5);

  // Appointment Start/End auto-save on blur (like the row's own inline inputs)
  // instead of requiring the batched Save button below — that button also
  // commits status/crew/rate together, which is easy to skip when all you
  // meant to do was fix a time.
  async function saveAppointmentTime(field: "start_time" | "end_time", value: string) {
    // Reject a save that would put End at or before Start — independently
    // editing the two fields (this is on-blur, one field at a time) has no
    // other guard against that, and a visit with End before Start silently
    // breaks every hours computation that reads it.
    const newStart = field === "start_time" ? value : startTime;
    const newEnd = field === "end_time" ? value : endTime;
    if (isEndBeforeStart(newStart, newEnd)) {
      toast.error("End time must be after Start time");
      if (field === "start_time") setStartTime(visit.startTime ?? ""); else setEndTime(visit.endTime ?? "");
      return;
    }
    // Job Start/End are the actual times (crew punches often need dispatcher
    // correction) — keep clocked_in_at/clocked_out_at in sync so the crew
    // app and report date-filters agree with whatever the dispatcher enters.
    const clockField = field === "start_time" ? "clocked_in_at" : "clocked_out_at";
    const clockIso = value ? dateAndTimeToIso(visit.scheduledDate, value) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { [field]: value || null, [clockField]: clockIso };
    // A genuine change means any actual_hours override measured before this
    // correction (e.g. the stop clock-out flow's figure) is now stale —
    // clear it so computeActualHours() and the DB rollup recompute from the
    // corrected time instead of staying frozen. Guarded on an actual change
    // so a blur with no edit doesn't wipe a real measured value.
    const existingValue = field === "start_time" ? visit.startTime : visit.endTime;
    if ((value || null) !== (existingValue || null)) updates.actual_hours = null;
    try {
      await updateVisit({ id: visit.id, updates });
      // Only reached in the non-divergent case (see the "Multiple times"
      // guard around the inputs below) — every member already tracked here
      // shares the same value on the side not being edited, safe to carry
      // forward unchanged. No member tracked yet → seed the whole crew
      // roster, same as Edit Job Times does when it first opens.
      // Targets the stop's shared anchor visit id, not this visit's own id
      // — see EditJobTimesDialog for why crm_crew_member_times always lives
      // against the anchor even for a sibling service visit like this one.
      const effectiveCrewId = visit.crewId ?? job?.crewId ?? null;
      const targets = memberTimes.length > 0
        ? memberTimes.map((t) => ({ crewMemberId: t.crewMemberId, otherClockedInAt: t.clockedInAt, otherClockedOutAt: t.clockedOutAt }))
        : effectiveCrewMemberIds(effectiveCrewId, richCrewsForSheet ?? [], dailyOverridesForSheet)
            .map((id) => ({ crewMemberId: id, otherClockedInAt: null, otherClockedOutAt: null }));
      await Promise.all(targets.map((t) => upsertMemberTimeForSheet.mutateAsync({
        visitId: anchorVisitId,
        crewMemberId: t.crewMemberId,
        clockedInAt:  field === "start_time" ? clockIso : t.otherClockedInAt,
        clockedOutAt: field === "end_time"   ? clockIso : t.otherClockedOutAt,
      })));
    } catch {
      toast.error("Failed to save time");
    }
  }

  // Notes state
  const [newComment,    setNewComment]    = useState("");
  const [notesToClient, setNotesToClient] = useState(visit.notesToClient ?? "");
  // Fall back to job-level master invoice description when visit has none
  const [invoiceDesc,   setInvoiceDesc]   = useState(visit.invoiceDescription ?? job?.invoiceDescription ?? "");
  const [notesToCrewInput, setNotesToCrewInput] = useState(visit.notesToCrew ?? job?.notesToCrew ?? "");
  const [savingNotesToCrew, setSavingNotesToCrew] = useState(false);
  useEffect(() => {
    setNotesToCrewInput(visit.notesToCrew ?? job?.notesToCrew ?? "");
  }, [visit.id, visit.notesToCrew, job?.notesToCrew]);

  async function saveNotesToCrew() {
    setSavingNotesToCrew(true);
    try {
      await updateVisit({ id: visit.id, updates: { notes_to_crew: notesToCrewInput || null } });
      toast.success("Notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotesToCrew(false);
    }
  }

  const effectiveRate = visit.rateCents ?? rateFallbackCents;
  const amt = visit.rateCents ?? rateFallbackCents ?? 0;

  async function handleSave() {
    const updates: Parameters<typeof updateVisit>[0]["updates"] = {
      status,
      sub_status: subStatus || null,
      crew_id: crewId || null,
      start_time: startTime || null,
      end_time: endTime || null,
      actual_hours: actualHours ? parseFloat(actualHours) : null,
      budgeted_hours: budgetedHoursInput ? parseFloat(budgetedHoursInput) : null,
      men_count: parseInt(menCount) || 0,
      qty: qty ? parseFloat(qty) : null,
      rate_cents: rateCents ? Math.round(parseFloat(rateCents) * 100) : null,
      notes_to_client: notesToClient || null,
      invoice_description: invoiceDesc || null,
    };
    if (status === "completed" && visit.status !== "completed") {
      updates.completed_at = new Date().toISOString();
    }
    if (status === "dispatched" && visit.status !== "dispatched") {
      updates.dispatched_at = new Date().toISOString();
    }
    try {
      await updateVisit({ id: visit.id, updates, jobId: visit.jobId, jobType: visit.job?.jobType });
      toast.success("Saved");
      onOpenChange(false);
    } catch {
      toast.error("Failed to save");
    }
  }

  async function addComment() {
    if (!newComment.trim()) return;
    const comment: JobComment = {
      id: crypto.randomUUID(),
      authorName: "Me",
      authorId: "current",
      text: newComment.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      await updateVisit({
        id: visit.id,
        updates: { job_comments: [...visit.jobComments, comment] },
      });
      setNewComment("");
      toast.success("Comment added");
    } catch {
      toast.error("Failed to add comment");
    }
  }

  async function handleInvoice() {
    try {
      const serviceDate = visit.scheduledDate ?? new Date().toISOString().slice(0, 10);
      const masterDescription = visit.invoiceDescription || job?.invoiceDescription || null;
      const lineItems = services.map((s) => ({
        name: s.serviceName,
        description: masterDescription || stripHtml(s.serviceInvoiceDescription || "") || s.serviceName,
        qty: s.qty ?? 1,
        rateCents: s.rateCents ?? 0,
        totalCents: (s.qty ?? 1) * (s.rateCents ?? 0),
        serviceDate,
      }));
      const subtotalCents = lineItems.reduce((sum, li) => sum + li.totalCents, 0);
      const invoice = await createInvoice({
        jobId: visit.jobId,
        clientId: visit.clientId,
        description: visit.invoiceDescription ?? job?.invoiceDescription ?? serviceName,
        invoiceDate: visit.scheduledDate ?? new Date().toISOString().slice(0, 10),
        lineItems,
        subtotalCents,
        taxRateBps: 0,
        taxCents: 0,
        totalCents: subtotalCents,
      });
      toast.success("Invoice created");
      onOpenChange(false);
      router.push(`/crm/accounting/invoices/${invoice.id}`);
    } catch {
      toast.error("Failed to create invoice");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[680px] sm:max-w-[680px] p-0 flex flex-col gap-0"
      >
        {/* Header — light gray, CMMS-style */}
        <SheetHeader className="shrink-0 border-b bg-slate-50 px-5 py-4 pr-14">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="text-base font-bold text-slate-900 leading-tight truncate">
                {serviceName}
              </SheetTitle>
              {visit.clientName && (
                <p className="text-sm text-slate-500 mt-0.5">{visit.clientName}</p>
              )}
              {job?.serviceAddress && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {job.serviceAddress}{job.serviceCity ? `, ${job.serviceCity}` : ""}{job.serviceZip ? ` ${job.serviceZip}` : ""}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {job?.id && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs px-2"
                  onClick={() => { onOpenChange(false); router.push(`/crm/scheduling/jobs/${job.id}`); }}
                >
                  View Job →
                </Button>
              )}
              {visit.status === "completed" && visit.clientId && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-brand-500 hover:bg-brand-600 text-white px-3"
                  onClick={handleInvoice}
                  disabled={invoicing}
                >
                  <FileText className="mr-1 h-3 w-3" />
                  Invoice
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: form + notes */}
          <div className="flex-1 overflow-y-auto">

            {/* Schedule / assign section */}
            <div className="px-5 pt-4 pb-3 border-b space-y-2.5">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                {/* Schedule Date */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Schedule Date
                  </label>
                  <span className="text-sm text-slate-700">{visit.scheduledDate}</span>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Status
                  </label>
                  <Select value={status} onValueChange={(v) => setStatus(v as VisitStatus)}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Assigned To */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Assigned To
                  </label>
                  <Select
                    value={crewId || "unassigned"}
                    onValueChange={(v) => setCrewId(v === "unassigned" ? "" : v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Unassigned" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                      {crews.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sub Status */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Sub Status
                  </label>
                  <Select
                    value={subStatus || "none"}
                    onValueChange={(v) => setSubStatus(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-xs">None</SelectItem>
                      {SUB_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Job Start */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Job Start
                  </label>
                  {startHasMultipleTimes ? (
                    <button
                      type="button"
                      onClick={() => onEditTimes(visit)}
                      title="Crew members have different clock-in times — open Edit Job Times"
                      className="flex h-7 w-full items-center rounded-md border border-input bg-background px-3 text-left text-xs italic text-amber-600 hover:bg-slate-50"
                    >
                      Multiple times
                    </button>
                  ) : editingAppointmentStart ? (
                    <Input
                      type="time"
                      autoFocus
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      onKeyDown={(e) => { if (/^[0-9apAP]$/.test(e.key)) setAppointmentStartTouched(true); }}
                      onBlur={() => {
                        setEditingAppointmentStart(false);
                        if (appointmentStartTouched && !startTime) toast.error("Start time wasn't set — pick AM or PM before leaving the field");
                        setAppointmentStartTouched(false);
                        void saveAppointmentTime("start_time", startTime);
                        // See the row's identical Start->End handling —
                        // relatedTarget isn't reliably populated on blur for
                        // this composite input across browsers, so defer one
                        // tick and check document.activeElement directly
                        // once the browser's own focus change has settled.
                        setTimeout(() => {
                          if (document.activeElement === appointmentEndButtonRef.current) setEditingAppointmentEnd(true);
                        }, 0);
                      }}
                      className="h-7 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingAppointmentStart(true)}
                      className="flex h-7 w-full items-center rounded-md border border-input bg-background px-3 text-left text-xs hover:bg-slate-50"
                    >
                      {startTime ? formatTimeShort(startTime) : <span className="text-slate-400">Not set</span>}
                    </button>
                  )}
                  {startPunchDiffers && (
                    <p
                      className="mt-0.5 text-[10px] text-amber-500"
                      title={`Crew punched in at ${formatTimeShort(startClockTime)} — different from what's shown above`}
                    >
                      ⏱ Punched in {formatTimeShort(startClockTime)}
                    </p>
                  )}
                </div>

                {/* Job End */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
                    Job End
                  </label>
                  {endHasMultipleTimes ? (
                    <button
                      type="button"
                      onClick={() => onEditTimes(visit)}
                      title="Crew members have different clock-out times — open Edit Job Times"
                      className="flex h-7 w-full items-center rounded-md border border-input bg-background px-3 text-left text-xs italic text-amber-600 hover:bg-slate-50"
                    >
                      Multiple times
                    </button>
                  ) : editingAppointmentEnd ? (
                    <Input
                      type="time"
                      autoFocus
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      onKeyDown={(e) => { if (/^[0-9apAP]$/.test(e.key)) setAppointmentEndTouched(true); }}
                      onBlur={() => {
                        setEditingAppointmentEnd(false);
                        if (appointmentEndTouched && !endTime) toast.error("End time wasn't set — pick AM or PM before leaving the field");
                        setAppointmentEndTouched(false);
                        void saveAppointmentTime("end_time", endTime);
                      }}
                      className="h-7 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      ref={appointmentEndButtonRef}
                      onClick={() => setEditingAppointmentEnd(true)}
                      className="flex h-7 w-full items-center rounded-md border border-input bg-background px-3 text-left text-xs hover:bg-slate-50"
                    >
                      {endTime ? formatTimeShort(endTime) : <span className="text-slate-400">Not set</span>}
                    </button>
                  )}
                  {endPunchDiffers && (
                    <p
                      className="mt-0.5 text-[10px] text-amber-500"
                      title={`Crew punched out at ${formatTimeShort(endClockTime)} — different from what's shown above`}
                    >
                      ⏱ Punched out {formatTimeShort(endClockTime)}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => onEditTimes(visit)}
              >
                <Clock className="mr-1.5 h-3 w-3" />
                Edit Job Times
              </Button>
            </div>

            {/* Notes tabs */}
            <Tabs defaultValue="job-notes" className="flex flex-col flex-1">
              <div className="border-b bg-white">
                <TabsList className="h-9 rounded-none bg-transparent justify-start px-4 gap-0">
                  {(["job-notes","job-comments","client-notes","invoice-desc","audit"] as const).map((v, i) => {
                    // Job Notes = instructions to the crew (notesToCrew). Job Comments =
                    // scheduling remarks / crew-tablet submissions (jobComments) — kept as
                    // two distinct counts so a new comment doesn't read as a new "note".
                    const cnt = v === "job-notes" ? ((visit.notesToCrew ?? visit.job?.notesToCrew) ? 1 : 0)
                      : v === "job-comments" ? visit.jobComments.length
                      : 0;
                    const labels = ["Job Notes","Job Comments","Notes to Client","Invoice Desc.","Audit"];
                    return (
                      <TabsTrigger
                        key={v}
                        value={v}
                        className="h-full rounded-none border-b-2 border-transparent px-4 py-0 text-xs font-medium text-slate-500 data-[state=active]:border-brand-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-slate-900"
                      >
                        {labels[i]}{cnt > 0 ? ` (${cnt})` : ""}
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </div>

              {/* Job Notes — instructions to the crew (notesToCrew), similar to an
                  estimate instruction. Distinct from Job Comments below. Editable
                  here (was previously read-only, the only way to set it was the
                  Jobs screen's Visits tab). Deliberately NOT rendered as a banner
                  row on the dispatch board itself — these can run long and would
                  clog up the board, unlike short job comments. */}
              <TabsContent value="job-notes" className="m-0 p-4 space-y-3">
                {job?.notesToCrew && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded px-2 py-1.5">
                    <span className="font-semibold">Job note:</span> {job.notesToCrew}
                  </p>
                )}
                <Textarea
                  value={notesToCrewInput}
                  onChange={(e) => setNotesToCrewInput(e.target.value)}
                  placeholder="Instructions for the crew…"
                  className="h-24 resize-none text-xs"
                />
                <Button size="sm" className="h-7 text-xs" onClick={saveNotesToCrew} disabled={savingNotesToCrew}>
                  {savingNotesToCrew ? "Saving…" : "Save Notes"}
                </Button>
              </TabsContent>

              {/* Job Comments — scheduling remarks and notes submitted by the crew
                  from their tablet back to the office. Distinct from Job Notes above. */}
              <TabsContent value="job-comments" className="m-0 p-4 space-y-3">
                {visit.jobComments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {visit.jobComments.map((c) => (
                      <div key={c.id} className="rounded bg-orange-50/70 border border-orange-100 px-3 py-2">
                        <p className="text-[10px] font-semibold text-slate-500 mb-0.5">{c.authorName}</p>
                        <p className="text-xs text-slate-700">{c.text}</p>
                      </div>
                    ))}
                  </div>
                )}
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment… (Shift+Enter to send)"
                  className="h-24 resize-none text-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void addComment();
                    }
                  }}
                />
                <Button size="sm" className="h-7 text-xs" onClick={addComment}>
                  Add Comment
                </Button>
              </TabsContent>

              {/* Notes to Client */}
              <TabsContent value="client-notes" className="m-0 p-4 space-y-3">
                <Textarea
                  value={notesToClient}
                  onChange={(e) => setNotesToClient(e.target.value)}
                  placeholder="Notes visible to client on invoice/portal…"
                  className="h-32 resize-none text-xs"
                />
                <p className="text-[10px] text-slate-400">Saved when you click Save below.</p>
              </TabsContent>

              {/* Invoice Desc */}
              <TabsContent value="invoice-desc" className="m-0 p-4 space-y-3">
                {!visit.invoiceDescription && job?.invoiceDescription && (
                  <p className="text-[10px] text-slate-400 italic">
                    Showing job-level description. Edit below to override for this visit only.
                  </p>
                )}
                {!invoiceDesc && serviceInvoiceDescPreview && (
                  <p className="text-[10px] text-slate-400 italic">
                    Blank — invoices will use each service&apos;s own description: &quot;{serviceInvoiceDescPreview}&quot;
                  </p>
                )}
                <Textarea
                  value={invoiceDesc}
                  onChange={(e) => setInvoiceDesc(e.target.value)}
                  placeholder={serviceInvoiceDescPreview || "Description that will appear on the invoice…"}
                  className="h-32 resize-none text-xs"
                />
                <p className="text-[10px] text-slate-400">Saved when you click Save below.</p>
              </TabsContent>

              {/* Audit — includes the parent job's own entries (schedule, crew,
                  budgeted hours, rate, etc. are job-level fields), not just this
                  one visit's, so edits made anywhere on the job aren't invisible
                  from here. */}
              <TabsContent value="audit" className="m-0 p-4">
                <AuditTrailTab
                  groups={[
                    { recordType: "job", recordIds: job ? [job.id] : [] },
                    { recordType: "job_visit", recordIds: [visit.id] },
                  ]}
                />
              </TabsContent>
            </Tabs>

            {/* Services section */}
            {services.length > 0 && (
              <div className="border-t">
                <div className="bg-slate-50 border-b px-4 py-2">
                  <p className="text-xs font-semibold text-slate-600">Services ({services.length})</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2">Service</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Rate</th>
                      <th className="px-2 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id} className="border-b">
                        <td className="px-4 py-2 text-slate-700">{s.serviceName}</td>
                        <td className="px-2 py-2 text-right text-slate-500">{s.qty}</td>
                        <td className="px-2 py-2 text-right text-slate-500">
                          {s.rateCents != null ? formatCurrency(s.rateCents) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-slate-700">
                          {s.rateCents != null ? formatCurrency(s.rateCents * s.qty) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Products (materials) section */}
            {jobProducts.length > 0 && (
              <div className="border-t">
                <div className="bg-slate-50 border-b px-4 py-2">
                  <p className="text-xs font-semibold text-slate-600">Products ({jobProducts.length})</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      <th className="px-4 py-2">Product</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Unit Price</th>
                      <th className="px-2 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobProducts.map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="px-4 py-2 text-slate-700">{p.productName}</td>
                        <td className="px-2 py-2 text-right text-slate-500">{p.qty}</td>
                        <td className="px-2 py-2 text-right text-slate-500">{formatCurrency(p.unitPriceCents)}</td>
                        <td className="px-2 py-2 text-right font-medium text-slate-700">{formatCurrency(p.unitPriceCents * p.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right: costing panel */}
          <div className="w-44 shrink-0 border-l bg-slate-50 flex flex-col">
            <div className="px-4 pt-4 pb-3 border-b">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-3">
                Job Costing
              </p>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Billing Mode</span>
                  <span className="text-[11px] font-medium text-slate-700">Flat Rate</span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">B. Hours</span>
                  <Input
                    type="number" step="0.25" min={0} value={budgetedHoursInput}
                    onChange={(e) => setBudgetedHoursInput(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Hours</span>
                  <Input
                    type="number" step="0.25" value={actualHours}
                    onChange={(e) => setActualHours(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                    placeholder="0.00"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Men (Total)</span>
                  <Input
                    type="number" min={0} value={menCount}
                    onChange={(e) => setMenCount(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Qty</span>
                  <Input
                    type="number" step="0.1" value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                    placeholder="—"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Rate</span>
                  <Input
                    type="number" step="0.01" value={rateCents}
                    onChange={(e) => setRateCents(e.target.value)}
                    className="h-6 w-16 text-[11px] text-right px-1"
                    placeholder="—"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">Expenses</span>
                  <span className="text-[11px] text-slate-400">0.00</span>
                </div>
              </div>
            </div>

            {/* Amount — green block matching SA */}
            <div className="mx-3 mt-3 rounded bg-green-500 px-3 py-3 text-center">
              <p className="text-lg font-bold text-white leading-tight">
                {formatCurrency(amt)}
              </p>
              <p className="text-[10px] text-green-100 mt-0.5">Amount</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between shrink-0 border-t bg-white px-5 py-3">
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="text-[10px] text-brand-600 hover:underline">
                Show: Attachments
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-80">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Attachments
              </p>
              <AttachmentsSection recordType="job" recordId={visit.jobId} />
            </PopoverContent>
          </Popover>
          <div className="flex items-center gap-3">
            <Button
              className="bg-brand-500 hover:bg-brand-600 text-white h-8 text-xs px-6"
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save"}
            </Button>
            <button
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── print dialog ──────────────────────────────────────────────────────────────

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { useCrewMemberTimes, useCrewMemberTimesForDate, useUpsertCrewMemberTime, useDeleteCrewMemberTime } from "@/lib/hooks/use-crew-app";

function PrintDialog({
  open, onOpenChange, visits, crews, selectedDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visits: CRMJobVisit[];
  crews: { id: string; name: string }[];
  selectedDate: string;
}) {
  const byCrew = (crews).map((c) => ({
    crew: c,
    visits: visits.filter((v) => v.crewId === c.id),
  })).filter((x) => x.visits.length > 0);
  const unassigned = visits.filter((v) => !v.crewId);

  function printRouteTable(cv: CRMJobVisit[]) {
    return (
      <table className="w-full text-xs border-collapse mt-2">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 px-2 py-1 text-left">#</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Client</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Address</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Service</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Time</th>
            <th className="border border-slate-300 px-2 py-1 text-center">B Hrs</th>
            <th className="border border-slate-300 px-2 py-1 text-left">Notes to Crew</th>
          </tr>
        </thead>
        <tbody>
          {cv.map((v, i) => {
            const job = v.job;
            const svc = (job?.services ?? []).map((s) => s.serviceName).join(", ");
            const addr = [job?.serviceAddress, job?.serviceCity].filter(Boolean).join(", ");
            return (
              <tr key={v.id} className="border-b border-slate-200">
                <td className="border border-slate-200 px-2 py-1 font-mono text-center">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-1 font-medium">{v.clientName ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1">{addr || "—"}</td>
                <td className="border border-slate-200 px-2 py-1">{svc || "—"}</td>
                <td className="border border-slate-200 px-2 py-1">{v.startTime ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1 text-center">{computeBudgetedHours(v)?.toFixed(1) ?? "—"}</td>
                <td className="border border-slate-200 px-2 py-1 italic text-slate-600">{(v as any).notesToCrew ?? ""}</td>
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
          <DialogTitle className="text-sm font-semibold">
            Print Route Sheets — {selectedDate}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-5 space-y-8">
          {byCrew.length === 0 && unassigned.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8">No visits to print for this date.</p>
          )}
          {byCrew.map(({ crew, visits: cv }) => (
            <div key={crew.id}>
              <div className="border-b-2 border-slate-800 pb-1 mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold">{crew.name}</h2>
                <span className="text-xs text-slate-500">{cv.length} stop{cv.length !== 1 ? "s" : ""} · {selectedDate}</span>
              </div>
              {printRouteTable(cv)}
            </div>
          ))}
          {unassigned.length > 0 && (
            <div>
              <div className="border-b-2 border-amber-600 pb-1 mb-2 flex items-baseline justify-between">
                <h2 className="text-sm font-bold text-amber-700">Unassigned</h2>
                <span className="text-xs text-amber-600">{unassigned.length} stop{unassigned.length !== 1 ? "s" : ""} · {selectedDate}</span>
              </div>
              {printRouteTable(unassigned)}
            </div>
          )}
        </div>
        <div className="shrink-0 border-t bg-white px-5 py-3 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">Uses your browser&apos;s print dialog</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>Close</Button>
            <Button size="sm" className="h-8 text-xs bg-brand-500 hover:bg-brand-600 text-white" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── team assignment dialog ────────────────────────────────────────────────────

function TeamAssignDialog({
  open,
  onOpenChange,
  visits,
  crews,
  selectedDate,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visits: CRMJobVisit[];
  crews: { id: string; name: string }[];
  selectedDate: string;
}) {
  const { mutateAsync: updateVisit } = useUpdateVisit();
  const { data: crewsWithMembers } = useCrews(false);
  const { data: dailyOverrides = [] } = useCrewDailyMembers(selectedDate);
  const { mutateAsync: setDailyMember } = useSetCrewDailyMember();
  const { mutateAsync: clearDailyMember } = useClearCrewDailyMember();
  const [pending, setPending] = useState(false);
  const [dragVisitId, setDragVisitId] = useState<string | null>(null);
  const [dragMemberId, setDragMemberId] = useState<string | null>(null);

  // Use crews-with-members data so member names show up; fall back to the prop
  const richCrews = crewsWithMembers ?? [];
  const unassigned = visits.filter((v) => !v.crewId);

  // crm_crew_members.crew_id is each member's PERMANENT default crew (managed in
  // Team settings). dailyOverrides moves a member onto a different crew for
  // selectedDate only — used below to compute each crew's roster for *this* day
  // without mutating the permanent roster.
  const defaultCrewByMember = new Map<string, string>();
  richCrews.forEach((c) => (c.members ?? []).forEach((m) => defaultCrewByMember.set(m.id, c.id)));
  const overrideCrewByMember = new Map(dailyOverrides.map((o) => [o.member_id, o.crew_id]));
  const allMembers = richCrews.flatMap((c) => c.members ?? []);

  const byCrew = (richCrews.length > 0 ? richCrews : crews).map((c) => ({
    crew: c,
    visits: visits.filter((v) => v.crewId === c.id),
    members: allMembers.filter((m) => (overrideCrewByMember.get(m.id) ?? defaultCrewByMember.get(m.id)) === c.id),
  }));

  async function moveMember(memberId: string, targetCrewId: string) {
    try {
      if (defaultCrewByMember.get(memberId) === targetCrewId) {
        await clearDailyMember({ memberId, workDate: selectedDate });
      } else {
        await setDailyMember({ memberId, crewId: targetCrewId, workDate: selectedDate });
      }
    } catch {
      toast.error("Failed to move member");
    }
  }

  async function reassign(visitId: string, crewId: string | null, jobId?: string) {
    try {
      await updateVisit({ id: visitId, updates: { crew_id: crewId }, jobId });
    } catch {
      toast.error("Failed to reassign");
    }
  }

  async function dispatchAll() {
    setPending(true);
    try {
      const scheduled = visits.filter((v) => v.status === "scheduled" && v.crewId);
      await Promise.all(
        scheduled.map((v) =>
          updateVisit({
            id: v.id,
            updates: { status: "dispatched", dispatched_at: new Date().toISOString() },
          })
        )
      );
      toast.success(`${scheduled.length} visit${scheduled.length !== 1 ? "s" : ""} dispatched`);
      onOpenChange(false);
    } catch {
      toast.error("Dispatch failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0 bg-[#4a4a4a] text-white px-5 py-3">
          <DialogTitle className="text-sm font-semibold">
            Team Assignment —{" "}
            <span className="text-red-300">{selectedDate}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Unassigned pool — drop target to un-assign */}
          <div
            className="w-52 shrink-0 border-r bg-green-50 p-4"
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragVisitId) { const jId = visits.find(v => v.id === dragVisitId)?.jobId; void reassign(dragVisitId, null, jId); setDragVisitId(null); } }}
          >
            <p className="text-[10px] font-semibold uppercase text-green-700 tracking-wide mb-3">
              Unassigned ({unassigned.length})
            </p>
            <div className="space-y-1.5">
              {unassigned.length === 0 ? (
                <p className="text-xs text-green-600 italic">All visits assigned</p>
              ) : (
                unassigned.map((v) => {
                  const svcName = v.job?.services?.[0]?.serviceName ?? "Visit";
                  return (
                    <div
                      key={v.id}
                      draggable
                      onDragStart={() => setDragVisitId(v.id)}
                      onDragEnd={() => setDragVisitId(null)}
                      className="rounded bg-white border border-green-200 px-2 py-1.5 cursor-grab active:cursor-grabbing"
                    >
                      <p className="text-xs font-medium text-slate-700 truncate">{v.clientName ?? "—"}</p>
                      <p className="text-[10px] text-slate-400 truncate">{svcName}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {crews.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => reassign(v.id, c.id, v.jobId)}
                            className="text-[9px] bg-slate-100 hover:bg-brand-100 hover:text-brand-700 text-slate-500 rounded px-1.5 py-0.5 transition-colors"
                          >
                            → {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Crew columns */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex h-full min-w-max">
              {byCrew.map(({ crew, visits: crewVisits, members }) => (
                <div
                  key={crew.id}
                  className="w-52 shrink-0 border-r p-4"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragVisitId) { const jId = visits.find(v => v.id === dragVisitId)?.jobId; void reassign(dragVisitId, crew.id, jId); setDragVisitId(null); }
                    if (dragMemberId) {
                      void moveMember(dragMemberId, crew.id);
                      setDragMemberId(null);
                    }
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase text-slate-600 tracking-wide truncate mb-1">
                    {crew.name} ({crewVisits.length})
                  </p>
                  {/* Draggable member chips — amber means "on loan" from another
                      crew for selectedDate only; drag back to their own crew (or
                      click) to send them back. */}
                  <div className="flex flex-wrap gap-1 mb-2 min-h-[20px]">
                    {members.map((m) => {
                      const onLoan = defaultCrewByMember.get(m.id) !== crew.id;
                      return (
                        <div
                          key={m.id}
                          draggable
                          onDragStart={() => setDragMemberId(m.id)}
                          onDragEnd={() => setDragMemberId(null)}
                          onClick={() => { const home = defaultCrewByMember.get(m.id); if (onLoan && home) void moveMember(m.id, home); }}
                          className={cn(
                            "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium cursor-grab active:cursor-grabbing select-none",
                            onLoan
                              ? "bg-amber-100 border-amber-300 text-amber-700"
                              : "bg-brand-100 border-brand-200 text-brand-700"
                          )}
                          title={onLoan
                            ? `On loan from their usual crew for ${selectedDate} only — click to send back`
                            : "Drag to move to another crew for today only"}
                        >
                          {m.employeeName ?? m.employeeId}
                        </div>
                      );
                    })}
                    {members.length === 0 && (
                      <p className="text-[10px] text-slate-300 italic">No members — drag here</p>
                    )}
                  </div>
                  <div className="space-y-1.5 min-h-[40px]">
                    {crewVisits.map((v) => {
                      const svcName = v.job?.services?.[0]?.serviceName ?? "Visit";
                      return (
                        <div
                          key={v.id}
                          draggable
                          onDragStart={() => setDragVisitId(v.id)}
                          onDragEnd={() => setDragVisitId(null)}
                          className="rounded bg-slate-50 border px-2 py-1.5 group relative cursor-grab active:cursor-grabbing"
                        >
                          <p className="text-xs font-medium text-slate-700 truncate">{v.clientName ?? "—"}</p>
                          <p className="text-[10px] text-slate-400 truncate">{svcName}</p>
                          <VisitStatusIcon status={v.status} />
                          <button
                            onClick={() => reassign(v.id, null, v.jobId)}
                            className="absolute top-1 right-1 hidden group-hover:flex text-[9px] text-slate-400 hover:text-red-500"
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {byCrew.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-slate-400">No crews configured</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between shrink-0 border-t bg-white px-5 py-3">
          <p className="text-xs text-slate-500">
            {visits.filter((v) => v.crewId).length} of {visits.length} visits assigned
          </p>
          <div className="flex items-center gap-2">
            <Button
              className="bg-orange-500 hover:bg-orange-600 text-white h-8 text-xs px-4"
              onClick={dispatchAll}
              disabled={pending}
            >
              <Smartphone className="mr-1.5 h-3.5 w-3.5" />
              {pending ? "Dispatching…" : "Dispatch Assigned"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── edit job times dialog ─────────────────────────────────────────────────────
// Per-crew-member start/end times for a single visit — manually editable so the
// office can enter or correct times, not just what the crew tablet punches.

function isoToDateAndTime(iso: string | null, fallbackDate: string): { date: string; time: string } {
  if (!iso) return { date: fallbackDate, time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function dateAndTimeToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Native <input type="time"> always yields zero-padded 24h "HH:MM", so a
// plain string compare is a valid time-of-day ordering — no Date parsing
// needed. Only rejects when BOTH sides are actually set; an empty value
// means "not entered yet" (e.g. saving Start before End exists), not a
// real end-before-start problem, and must be allowed through.
function isEndBeforeStart(start: string, end: string): boolean {
  return !!start && !!end && end <= start;
}

function EditJobTimeRow({
  crewMemberId,
  memberName,
  clockedInAt,
  clockedOutAt,
  visitDate,
  onSave,
  onDelete,
}: {
  crewMemberId: string;
  memberName: string;
  clockedInAt: string | null;
  clockedOutAt: string | null;
  visitDate: string;
  onSave: (date: string, start: string, end: string) => void;
  onDelete: () => void;
}) {
  const startInit = isoToDateAndTime(clockedInAt, visitDate);
  const endInit = isoToDateAndTime(clockedOutAt, visitDate);
  const [date, setDate] = useState(startInit.date || endInit.date || visitDate);
  const [start, setStart] = useState(startInit.time);
  const [end, setEnd] = useState(endInit.time);

  useEffect(() => {
    const s = isoToDateAndTime(clockedInAt, visitDate);
    const e = isoToDateAndTime(clockedOutAt, visitDate);
    setDate(s.date || e.date || visitDate);
    setStart(s.time);
    setEnd(e.time);
  }, [clockedInAt, clockedOutAt, visitDate]);

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1.5">
      <span className="w-28 shrink-0 truncate text-sm text-slate-700">{memberName}</span>
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)}
        onBlur={() => onSave(date, start, end)} className="h-8 w-36 shrink-0 text-xs" />
      <Input type="time" value={start} onChange={(e) => setStart(e.target.value)}
        onBlur={() => onSave(date, start, end)} className="h-8 w-32 shrink-0 text-xs" />
      <span className="shrink-0 text-xs text-slate-400">to</span>
      <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
        onBlur={() => onSave(date, start, end)} className="h-8 w-32 shrink-0 text-xs" />
      <button onClick={onDelete} className="shrink-0 text-slate-300 hover:text-red-500" title="Remove">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function EditJobTimesDialog({
  open,
  onOpenChange,
  visit,
  anchorVisitId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  visit: CRMJobVisit;
  /** The stop's anchor visit id — a "stop" (same client/day/crew/address)
   * clocks in/out as one unit, so crm_crew_member_times rows always live
   * against the anchor, even when this dialog was opened for one of its
   * sibling services. Reads and writes here must target that same id or a
   * sibling's edits fork off a second, orphaned set of member-time rows. */
  anchorVisitId: string;
}) {
  const visitId = visit.id;
  const visitDate = visit.scheduledDate;
  const crewId = visit.crewId;

  const { data: memberTimes = [] } = useCrewMemberTimes(anchorVisitId);
  const { data: crewsWithMembers } = useCrews(false);
  const { data: allEmployees = [] } = useEmployees(true);
  const upsert = useUpsertCrewMemberTime();
  const del = useDeleteCrewMemberTime();
  const updateVisit = useUpdateVisit();
  const addCrewMember = useAddCrewMember();

  const crew = crewsWithMembers?.find((c) => c.id === crewId);
  const allMembers = crew?.members ?? [];
  const assignedIds = new Set(memberTimes.map((t) => t.crewMemberId));
  const availableMembers = allMembers.filter((m) => !assignedIds.has(m.id));
  // Anyone org-wide who isn't already on this crew's roster — e.g. someone
  // borrowed from another crew for the day. Picking one of these auto-adds
  // them to this crew's roster (see addRow) so a crm_crew_members row exists
  // to hang the time entry off of; existing roster members already covered
  // by availableMembers above are excluded so no one is offered twice.
  const rosterEmployeeIds = new Set(allMembers.map((m) => m.employeeId));
  const otherEmployees = allEmployees.filter((e) => !rosterEmployeeIds.has(e.id));

  const [newMemberId, setNewMemberId] = useState("");
  const [newDate, setNewDate] = useState(visitDate);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  // Auto-allocate every member of the visit's crew as soon as this dialog
  // opens with none entered yet, seeded with the visit's own Start/End if it
  // already has one — otherwise this always started completely empty and
  // required adding each crew member one at a time by hand even though the
  // crew (and often the time) was already known.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (memberTimes.length > 0 || allMembers.length === 0) return;
    seededRef.current = true;
    const clockedInAt = visit.startTime ? dateAndTimeToIso(visitDate, visit.startTime.slice(0, 5)) : null;
    const clockedOutAt = visit.endTime ? dateAndTimeToIso(visitDate, visit.endTime.slice(0, 5)) : null;
    allMembers.forEach((m) => upsert.mutate({ visitId: anchorVisitId, crewMemberId: m.id, clockedInAt, clockedOutAt }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberTimes.length, allMembers.length]);

  // Keep the dispatch board's Men column in sync with how many crew members
  // actually have a time entry here — only once there IS at least one entry,
  // so opening the dialog on a visit with a manually-set Men count (and no
  // per-member times yet) doesn't zero it out.
  useEffect(() => {
    if (memberTimes.length > 0 && memberTimes.length !== visit.menCount) {
      updateVisit.mutate({ id: visitId, updates: { men_count: memberTimes.length } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberTimes.length, visitId]);

  // Roll the earliest clock-in / latest clock-out across all crew members up
  // to the visit's own Start/End — otherwise times entered here never show
  // on the dispatch board row, never feed Actual Hours, and never appear in
  // the job panel's Appointment Start/End (which read visit.start_time/end_time).
  useEffect(() => {
    const ins = memberTimes.map((t) => t.clockedInAt).filter((v): v is string => !!v);
    const outs = memberTimes.map((t) => t.clockedOutAt).filter((v): v is string => !!v);
    if (ins.length === 0 && outs.length === 0) return;
    const earliestIn = ins.length > 0 ? ins.reduce((a, b) => (a < b ? a : b)) : null;
    const latestOut = outs.length > 0 ? outs.reduce((a, b) => (a > b ? a : b)) : null;
    const newStart = earliestIn ? isoToDateAndTime(earliestIn, visitDate).time : null;
    const newEnd = latestOut ? isoToDateAndTime(latestOut, visitDate).time : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {};
    // A rolled-up Start/End change means the real punch times moved —
    // clear any explicit actual_hours override (e.g. the men-multiplied
    // figure the stop clock-out flow wrote) so computeActualHours() and the
    // crm_recompute_job_actual_hours DB trigger both fall back to deriving
    // it fresh from these corrected times instead of a now-stale number.
    // Compare against just the HH:MM portion — isoToDateAndTime().time never
    // includes seconds, but visit.startTime/endTime come straight from a
    // Postgres `time` column (HH:MM:SS) and would otherwise never equal it,
    // firing this update (and clearing actual_hours) on every render.
    if (newStart && newStart !== (visit.startTime ?? "").slice(0, 5)) { updates.start_time = newStart; updates.actual_hours = null; }
    if (newEnd && newEnd !== (visit.endTime ?? "").slice(0, 5)) { updates.end_time = newEnd; updates.actual_hours = null; }
    if (Object.keys(updates).length > 0) {
      updateVisit.mutate({ id: visitId, updates });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberTimes, visitId, visitDate]);

  async function saveRow(memberId: string, date: string, start: string, end: string) {
    if (isEndBeforeStart(start, end)) {
      toast.error("End time must be after Start time");
      return;
    }
    try {
      await upsert.mutateAsync({
        visitId: anchorVisitId,
        crewMemberId: memberId,
        clockedInAt: dateAndTimeToIso(date, start),
        clockedOutAt: dateAndTimeToIso(date, end),
      });
    } catch {
      toast.error("Failed to save time");
    }
  }

  async function addRow() {
    if (!newMemberId) return;
    try {
      let memberId = newMemberId;
      // An "other employee" pick (not on this crew's roster) needs a real
      // crm_crew_members row first — crm_crew_member_times.crew_member_id
      // references that table, not employees directly.
      if (newMemberId.startsWith("emp:")) {
        if (!crewId) return;
        const employeeId = newMemberId.slice(4);
        const emp = otherEmployees.find((e) => e.id === employeeId);
        if (!emp) return;
        const created = await addCrewMember.mutateAsync({
          crewId,
          employeeId,
          name: `${emp.firstName} ${emp.lastName}`,
        });
        memberId = created.id;
      }
      await saveRow(memberId, newDate, newStart, newEnd);
      setNewMemberId("");
      setNewStart("");
      setNewEnd("");
    } catch {
      toast.error("Failed to add crew member");
    }
  }

  async function removeRow(memberId: string) {
    try {
      await del.mutateAsync({ visitId: anchorVisitId, crewMemberId: memberId });
    } catch {
      toast.error("Failed to remove");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Job Times</DialogTitle>
        </DialogHeader>

        <div className="divide-y">
          {memberTimes.map((t) => (
            <EditJobTimeRow
              key={t.crewMemberId}
              crewMemberId={t.crewMemberId}
              memberName={t.memberName ?? "Crew member"}
              clockedInAt={t.clockedInAt}
              clockedOutAt={t.clockedOutAt}
              visitDate={visitDate}
              onSave={(date, start, end) => saveRow(t.crewMemberId, date, start, end)}
              onDelete={() => removeRow(t.crewMemberId)}
            />
          ))}
          {memberTimes.length === 0 && (
            <p className="py-2 text-xs text-slate-400 italic">No times recorded yet</p>
          )}
        </div>

        {!crewId ? (
          <p className="border-t pt-3 text-xs text-slate-400 italic">Assign a crew to this visit first to add crew member times.</p>
        ) : availableMembers.length > 0 || otherEmployees.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t pt-3">
            <Select value={newMemberId || "unassigned"} onValueChange={(v) => setNewMemberId(v === "unassigned" ? "" : v)}>
              <SelectTrigger className="h-8 w-36 shrink-0 text-xs">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned" className="text-xs">Unassigned</SelectItem>
                {availableMembers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">This crew</SelectLabel>
                    {availableMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="text-xs">{m.employeeName ?? "Crew member"}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {otherEmployees.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">Other employees</SelectLabel>
                    {otherEmployees.map((e) => (
                      <SelectItem key={e.id} value={`emp:${e.id}`} className="text-xs">{e.firstName} {e.lastName}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="h-8 w-36 shrink-0 text-xs" />
            <Input type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} className="h-8 w-32 shrink-0 text-xs" />
            <span className="shrink-0 text-xs text-slate-400">to</span>
            <Input type="time" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} className="h-8 w-32 shrink-0 text-xs" />
            <button
              onClick={addRow}
              disabled={!newMemberId}
              className="shrink-0 rounded bg-brand-500 p-1.5 text-white hover:bg-brand-600 disabled:opacity-40"
              title="Add row"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p className="border-t pt-3 text-xs text-slate-400 italic">This crew has no members yet — add them in Team settings.</p>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── visit row ──────────────────────────────────────────────────────────────────

function VisitRow({
  visit,
  orderNum,
  selectedDate,
  onOpen,
  onEditTimes,
  driveMinsToNext,
  selected,
  onToggleSelect,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragOver,
  isVisible,
  onReorder,
  serviceCodeById,
  crewCodeById,
  manualRouteMode,
  memberTimes,
  anchorVisitId,
}: {
  visit: CRMJobVisit;
  /** 1-based position of this visit within its own crew's stops for the day (not the global row index). */
  orderNum: number;
  selectedDate: string;
  onOpen: (v: CRMJobVisit) => void;
  onEditTimes: (v: CRMJobVisit) => void;
  driveMinsToNext?: number;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isVisible: (col: ColKey) => boolean;
  serviceCodeById: Map<string, string>;
  crewCodeById: Map<string, string>;
  onReorder?: (id: string, newIndex: number) => void;
  manualRouteMode: boolean;
  /** This visit's per-crew-member punch records — used to detect whether the
   * crew was actually on site for the same window (safe to show/edit as one
   * Start/End pair) or genuinely different times (must show "Multiple times"
   * and route editing through the Edit Job Times dialog instead). */
  memberTimes: CrewMemberTime[];
  /** The stop's anchor visit id (see EditJobTimesDialog) — crm_crew_member_times
   * rows always live here, even for a sibling service visit like this one. */
  anchorVisitId: string;
}) {
  const job      = visit.job;
  const services = job?.services ?? [];
  // Same package-step scoping as the job detail sheet — a visit only covers
  // the one service it's linked to, not every step on the whole package.
  const linkedService = visit.jobServiceId ? services.find((s) => s.id === visit.jobServiceId) : null;
  const codeOrName = (s: { serviceId: string | null; serviceName: string }) =>
    (s.serviceId && serviceCodeById.get(s.serviceId)) || s.serviceName;
  const serviceName = linkedService
    ? codeOrName(linkedService)
    : services.length > 0 ? services.map(codeOrName).join(", ") : "—";
  const serviceTotal = linkedService
    ? (linkedService.rateCents ?? 0) * (linkedService.qty ?? 1)
    : services.reduce((s, svc) => s + (svc.rateCents ?? 0) * (svc.qty ?? 1), 0);
  // job.rateCents is one shared value for the whole job — fine as a fallback
  // for a visit covering the whole job, but wrong once a visit is linked to
  // ONE specific service (a multi-service job split across visits), where it
  // would show the same job-level amount on every one of that job's visits
  // instead of each service's own rate.
  const effectiveRate = visit.rateCents ?? (linkedService ? (serviceTotal || null) : (job?.rateCents ?? (serviceTotal > 0 ? serviceTotal : null)));
  const effectiveCrewId = visit.crewId ?? job?.crewId ?? null;
  const effectiveCrewName = visit.crewName ?? job?.crewName ?? null;
  const effectiveCrew = (effectiveCrewId && crewCodeById.get(effectiveCrewId)) || effectiveCrewName;
  const budgetedHours = computeBudgetedHours(visit);
  const actualHours = computeActualHours(visit);

  const updateVisit = useUpdateVisit();
  const [startVal, setStartVal] = useState(visit.startTime ?? "");
  const [endVal, setEndVal] = useState(visit.endTime ?? "");
  useEffect(() => { setStartVal(visit.startTime ?? ""); }, [visit.startTime]);
  useEffect(() => { setEndVal(visit.endTime ?? ""); }, [visit.endTime]);
  // Only render the actual <input type="time"> while the field is being
  // edited — otherwise a native time input with no value renders its "empty"
  // state however the browser/OS feels like (some show real-looking digits
  // like 12:30 instead of blank dashes), which reads as a fake default. A
  // plain read-only "—"/formatted-time span sidesteps that entirely.
  const [editingStart, setEditingStart] = useState(false);
  const [editingEnd,   setEditingEnd]   = useState(false);
  // A native time input's value is all-or-nothing — typing hour+minute but
  // leaving AM/PM unset (e.g. tabbing or clicking away before choosing it)
  // reports an EMPTY value, identical to never having typed anything. There's
  // no way to tell those two apart from the DOM, so instead of saving a
  // silent no-op, warn whenever the field was actually engaged with (onChange
  // fired at least once) but still comes out empty on blur.
  const [startTouched, setStartTouched] = useState(false);
  const [endTouched,   setEndTouched]   = useState(false);
  // Compared against Start's onBlur relatedTarget to tell "tabbed past the
  // last internal segment, really left Start" apart from "moved between
  // Start's own hour/minute/AM-PM segments" (see that onBlur for why).
  const endButtonRef = useRef<HTMLButtonElement>(null);

  const { data: richCrewsForSize } = useCrews(false);
  const { data: dailyOverridesForSize = [] } = useCrewDailyMembers(selectedDate);
  const upsertMemberTime = useUpsertCrewMemberTime();

  // Does the crew actually on this visit have different punch times from each
  // other? If so, a single Start/End pair on the row can't represent reality —
  // the cell shows "Multiple times" instead and editing has to go through the
  // Edit Job Times dialog, same as SA does. Checked independently per side:
  // it's possible only clock-outs differ (crew left staggered) while everyone
  // arrived together.
  const distinctIns  = new Set(memberTimes.map((t) => t.clockedInAt).filter((v): v is string => !!v));
  const distinctOuts = new Set(memberTimes.map((t) => t.clockedOutAt).filter((v): v is string => !!v));
  const startHasMultipleTimes = distinctIns.size > 1;
  const endHasMultipleTimes   = distinctOuts.size > 1;

  // Start/End and Clocked In/Out are two different fields (see saveVisitTime)
  // that only ever get FORCED to match when a dispatcher edits Start/End here
  // — a real crew-app punch that nobody has reconciled into Start/End yet
  // writes clocked_in_at/out directly and leaves Start/End exactly as it was
  // (often blank). That's the one case worth surfacing: a real punch exists
  // that this row's Start/End doesn't yet reflect. When they already agree
  // (the normal case after a correction), showing it again would just be the
  // redundant duplicate this replaced.
  const startClockTime = isoToDateAndTime(visit.clockedInAt, visit.scheduledDate).time;
  const endClockTime   = isoToDateAndTime(visit.clockedOutAt, visit.scheduledDate).time;
  const startPunchDiffers = startClockTime !== "" && startClockTime !== (startVal || "").slice(0, 5);
  const endPunchDiffers   = endClockTime   !== "" && endClockTime   !== (endVal   || "").slice(0, 5);

  async function saveVisitTime(field: "start_time" | "end_time", value: string) {
    // Same End-after-Start guard as the job panel's saveAppointmentTime —
    // editing Start/End independently (one field at a time, on blur) has no
    // other check keeping them in order.
    const newStart = field === "start_time" ? value : startVal;
    const newEnd = field === "end_time" ? value : endVal;
    if (isEndBeforeStart(newStart, newEnd)) {
      toast.error("End time must be after Start time");
      if (field === "start_time") setStartVal(visit.startTime ?? ""); else setEndVal(visit.endTime ?? "");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = { [field]: value || null };
    // Start/End IS the crew's actual time on site (a dispatcher correction of
    // — or manual stand-in for — a real punch), not just a scheduled
    // appointment window. Keep clocked_in_at/clocked_out_at in sync so the
    // crew app and report date-filters agree with whatever the dispatcher
    // enters.
    const clockField = field === "start_time" ? "clocked_in_at" : "clocked_out_at";
    const clockIso = value ? dateAndTimeToIso(visit.scheduledDate, value) : null;
    updates[clockField] = clockIso;
    // A genuine change to Start/End means whatever actual_hours was measured
    // before (e.g. the stop clock-out flow's men-multiplied figure) no longer
    // reflects reality — clear the override so computeActualHours() and the
    // DB rollup both fall back to deriving it fresh from the corrected time.
    // Guarded on an actual change so merely focusing/blurring the field
    // without editing it doesn't silently wipe a real measured value.
    const existingValue = field === "start_time" ? visit.startTime : visit.endTime;
    if ((value || null) !== (existingValue || null)) updates.actual_hours = null;
    // Typing a time is what actually sends a crew out for the day — pull the
    // headcount from who's really on that crew today (Team Assignment),
    // instead of leaving whatever men_count the visit happened to start with.
    if (visit.crewId) {
      const crewSize = effectiveCrewSize(visit.crewId, richCrewsForSize ?? [], dailyOverridesForSize);
      if (crewSize > 0) updates.men_count = crewSize;
    }
    try {
      await updateVisit.mutateAsync({ id: visit.id, updates });
      // This is only reached in the non-divergent case (the input is only
      // editable when startHasMultipleTimes/endHasMultipleTimes is false) —
      // so every member already tracked here shares the same value on the
      // side NOT being edited, safe to carry forward unchanged per member.
      // If no member has been tracked yet, seed the visit's whole crew
      // roster instead, same as Edit Job Times does when it first opens.
      // Targets the stop's shared anchor visit id, not this row's own id —
      // crm_crew_member_times always lives against the anchor (see
      // EditJobTimesDialog), so writing to visit.id here would fork off a
      // second, orphaned set of member-time rows for a sibling service.
      const targets = memberTimes.length > 0
        ? memberTimes.map((t) => ({ crewMemberId: t.crewMemberId, otherClockedInAt: t.clockedInAt, otherClockedOutAt: t.clockedOutAt }))
        : effectiveCrewMemberIds(visit.crewId, richCrewsForSize ?? [], dailyOverridesForSize)
            .map((id) => ({ crewMemberId: id, otherClockedInAt: null, otherClockedOutAt: null }));
      await Promise.all(targets.map((t) => upsertMemberTime.mutateAsync({
        visitId: anchorVisitId,
        crewMemberId: t.crewMemberId,
        clockedInAt:  field === "start_time" ? clockIso : t.otherClockedInAt,
        clockedOutAt: field === "end_time"   ? clockIso : t.otherClockedOutAt,
      })));
    } catch {
      toast.error("Failed to save time");
    }
  }

  const [menVal, setMenVal] = useState(String(visit.menCount ?? ""));
  useEffect(() => { setMenVal(String(visit.menCount ?? "")); }, [visit.menCount]);

  function saveMenCount(value: string) {
    const n = parseInt(value, 10);
    updateVisit.mutate(
      { id: visit.id, updates: { men_count: Number.isNaN(n) || n < 0 ? 0 : n } },
      { onError: () => toast.error("Failed to save crew size") }
    );
  }

  const [bHrsVal, setBHrsVal] = useState(String(budgetedHours ?? ""));
  useEffect(() => { setBHrsVal(String(budgetedHours ?? "")); }, [budgetedHours]);

  function saveBudgetedHours(value: string) {
    const n = parseFloat(value);
    updateVisit.mutate(
      { id: visit.id, updates: { budgeted_hours: value === "" || Number.isNaN(n) ? null : n } },
      { onError: () => toast.error("Failed to save budgeted hours") }
    );
  }

  const lastSvc = job?.lastServiceDate
    ? new Date(job.lastServiceDate + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
    : "—";

  const serviceColor = services.length > 0
    ? "bg-green-100 text-green-700 border-green-200"
    : "bg-slate-100 text-slate-500 border-slate-200";

  // suppress unused warning — selectedDate is available for future use
  void selectedDate;

  // Fixed cols (checkbox, #, St, Client) + whichever toggleable cols are shown —
  // used so the note/comment banner rows below can span the full table width.
  const totalCols = 4 + COL_DEFS.filter((c) => isVisible(c.key)).length;
  const crewNoteBanner = visit.notesToCrew ?? visit.job?.notesToCrew ?? null;

  return (
    <>
    <tr
      className={cn(
        "group border-b border-slate-100 text-xs cursor-pointer transition-colors",
        isDragOver ? "bg-brand-50 border-brand-300" : selected ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-50"
      )}
      onClick={() => onOpen(visit)}
      draggable={manualRouteMode}
      onDragStart={() => manualRouteMode && onDragStart(visit.id)}
      onDragOver={(e) => { if (manualRouteMode) { e.preventDefault(); onDragOver(visit.id); } }}
      onDragEnd={onDragEnd}
    >
      {/* Checkbox */}
      <td className="w-8 px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(visit.id)} className="h-3.5 w-3.5" />
      </td>

      {/* Drag handle + Order — only interactive in Manual Route mode, so
          clicking into a row's other fields (e.g. Start/End time) can never
          be mistaken by the browser for starting a drag on the row. */}
      <td className="w-10 px-1 py-2 text-center font-mono">
        <div className="flex items-center justify-center gap-0.5">
          <GripVertical className={cn("h-3 w-3 shrink-0", manualRouteMode ? "text-slate-300 cursor-grab active:cursor-grabbing" : "text-slate-200")} />
          {onReorder && manualRouteMode ? (
            <input
              type="number"
              defaultValue={orderNum}
              key={orderNum}
              min={1}
              className="w-7 text-center text-[10px] text-slate-600 bg-transparent border border-slate-200 rounded focus:outline-none focus:border-brand-400"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = parseInt((e.target as HTMLInputElement).value, 10);
                  if (!isNaN(val)) onReorder(visit.id, val - 1);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) onReorder(visit.id, val - 1);
              }}
            />
          ) : (
            <span className="text-slate-400 text-[10px]">{orderNum}</span>
          )}
        </div>
        {driveMinsToNext !== undefined && (
          <div className="text-[9px] text-blue-500 font-normal leading-tight whitespace-nowrap">
            ↓{driveMinsToNext}m
          </div>
        )}
      </td>

      {/* St */}
      <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <StatusCycleButton visit={visit} />
      </td>

      {/* Client (+ address below, like the Jobs screen — City/Zip stay in
          their own columns since they're used for routing) */}
      <td className="min-w-[140px] px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <Link
          href={`/crm/clients/${visit.clientId}`}
          className="block truncate max-w-[140px] font-medium text-brand-600 hover:underline"
        >
          {visit.clientName ?? "—"}
        </Link>
        {job?.serviceAddress && (
          <p className="truncate max-w-[140px] text-[10px] text-slate-400">{job.serviceAddress}</p>
        )}
      </td>

      {/* Service */}
      {isVisible("service") && (
        <td className="min-w-[110px] px-2 py-2">
          <span className={cn(
            "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border truncate max-w-[110px]",
            serviceColor
          )}>
            {serviceName}
          </span>
        </td>
      )}

      {/* Date */}
      {isVisible("date") && (
        <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{formatDateShort(visit.scheduledDate)}</td>
      )}

      {/* City */}
      {isVisible("city") && (
        <td className="px-2 py-2 text-slate-500">{job?.serviceCity ?? "—"}</td>
      )}

      {/* Zip */}
      {isVisible("zip") && (
        <td className="px-2 py-2 text-slate-500">{job?.serviceZip ?? "—"}</td>
      )}

      {/* Assigned */}
      {isVisible("assigned") && (
        <td className="min-w-[90px] px-2 py-2 text-slate-600 font-medium">
          {effectiveCrew ?? <span className="text-slate-300 italic">—</span>}
        </td>
      )}

      {/* Last Svc */}
      {isVisible("last_svc") && (
        <td className="px-2 py-2 text-slate-400 whitespace-nowrap">{lastSvc}</td>
      )}

      {/* Start */}
      {isVisible("start") && (
        <td className="px-1 py-1 text-slate-400 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          {startHasMultipleTimes ? (
            <button
              type="button"
              onClick={() => onEditTimes(visit)}
              title="Crew members have different clock-in times — open Edit Job Times"
              className="w-[92px] rounded border border-transparent px-1 py-0.5 text-left text-[11px] italic text-amber-600 hover:border-slate-200 hover:bg-slate-50"
            >
              Multiple times
            </button>
          ) : (
            <div className="flex flex-col gap-0.5">
              {editingStart ? (
                <input
                  type="time"
                  autoFocus
                  value={startVal}
                  onChange={(e) => setStartVal(e.target.value)}
                  onKeyDown={(e) => { if (/^[0-9apAP]$/.test(e.key)) setStartTouched(true); }}
                  onBlur={() => {
                    setEditingStart(false);
                    if (startTouched && !startVal) toast.error("Start time wasn't set — pick AM or PM before leaving the field");
                    setStartTouched(false);
                    void saveVisitTime("start_time", startVal);
                    // A native time input has its own internal hour/minute/AM-PM
                    // segments — Tab moves between THOSE first, only actually
                    // leaving the input (firing this blur) once you tab past the
                    // last one, landing on whatever's next in the DOM (End's
                    // button — it's only a real <input> once clicked). blur's own
                    // relatedTarget isn't reliably populated for this across
                    // browsers for a composite input like this, so defer one
                    // tick and check document.activeElement directly instead —
                    // that's set for real once the browser's own focus change
                    // has actually finished.
                    setTimeout(() => {
                      if (document.activeElement === endButtonRef.current) setEditingEnd(true);
                    }, 0);
                  }}
                  className="w-[92px] rounded border border-brand-400 bg-transparent px-1 py-0.5 text-xs text-slate-600 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingStart(true)}
                  className="w-[92px] rounded border border-transparent px-1 py-0.5 text-left text-xs text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                >
                  {startVal ? formatTimeShort(startVal) : <span className="text-slate-300 italic">—</span>}
                </button>
              )}
              {/* A real crew-app punch exists that Start doesn't reflect yet —
                  see the startPunchDiffers comment above for why this is the
                  one case worth surfacing instead of just duplicating Start. */}
              {startPunchDiffers && (
                <span
                  className="text-[9px] leading-none text-amber-500"
                  title={`Crew punched in at ${formatTimeShort(startClockTime)} — different from what's shown above`}
                >
                  ⏱ {formatTimeShort(startClockTime)}
                </span>
              )}
            </div>
          )}
        </td>
      )}

      {/* End */}
      {isVisible("end") && (
        <td className="px-1 py-1 text-slate-400 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-0.5">
              {endHasMultipleTimes ? (
                <button
                  type="button"
                  onClick={() => onEditTimes(visit)}
                  title="Crew members have different clock-out times — open Edit Job Times"
                  className="w-[92px] rounded border border-transparent px-1 py-0.5 text-left text-[11px] italic text-amber-600 hover:border-slate-200 hover:bg-slate-50"
                >
                  Multiple times
                </button>
              ) : editingEnd ? (
                <input
                  type="time"
                  autoFocus
                  value={endVal}
                  onChange={(e) => setEndVal(e.target.value)}
                  onKeyDown={(e) => { if (/^[0-9apAP]$/.test(e.key)) setEndTouched(true); }}
                  onBlur={() => {
                    setEditingEnd(false);
                    if (endTouched && !endVal) toast.error("End time wasn't set — pick AM or PM before leaving the field");
                    setEndTouched(false);
                    void saveVisitTime("end_time", endVal);
                  }}
                  className="w-[92px] rounded border border-brand-400 bg-transparent px-1 py-0.5 text-xs text-slate-600 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  ref={endButtonRef}
                  onClick={() => setEditingEnd(true)}
                  className="w-[92px] rounded border border-transparent px-1 py-0.5 text-left text-xs text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                >
                  {endVal ? formatTimeShort(endVal) : <span className="text-slate-300 italic">—</span>}
                </button>
              )}
              {/* Only way to correct per-crew-member times, or to split a single
                  Start/End pair apart once the crew's times actually diverge —
                  relocated here (next to Start/End, where the times it edits
                  actually live) instead of the far-right Notes/icons column. */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEditTimes(visit); }}
                title="Edit job times"
                className="shrink-0 text-slate-300 hover:text-brand-600 transition-colors"
              >
                <Clock className="h-3 w-3" />
              </button>
            </div>
            {/* Same real-punch-vs-displayed-End divergence check as Start. */}
            {endPunchDiffers && (
              <span
                className="text-[9px] leading-none text-amber-500"
                title={`Crew punched out at ${formatTimeShort(endClockTime)} — different from what's shown above`}
              >
                ⏱ {formatTimeShort(endClockTime)}
              </span>
            )}
          </div>
        </td>
      )}

      {/* B Hrs */}
      {isVisible("b_hrs") && (
        <td className="px-1 py-1 text-right text-slate-500" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            min={0}
            step="0.25"
            value={bHrsVal}
            onChange={(e) => setBHrsVal(e.target.value)}
            onBlur={() => saveBudgetedHours(bHrsVal)}
            className="w-14 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-xs text-slate-600 hover:border-slate-200 focus:border-brand-400 focus:outline-none"
          />
        </td>
      )}

      {/* Actual — used to also show a small "Clocked in: HH:MM–HH:MM" caption
          here, but that's just clockedInAt/clockedOutAt, which (per
          saveVisitTime) always equals whatever Start/End show — showing it
          twice was the confusing part, so it's gone from here entirely. */}
      {isVisible("actual") && (
        <td className="px-2 py-2 text-right text-slate-500">
          {actualHours != null ? actualHours.toFixed(2) : "—"}
        </td>
      )}

      {/* Variance = actual - budgeted. Green means under budget (actual < budgeted),
          red means over budget (actual > budgeted). */}
      {isVisible("variance") && (
        <td className="px-2 py-2 text-right tabular-nums">
          {actualHours != null && budgetedHours != null ? (
            <span className={cn("font-medium", actualHours > budgetedHours ? "text-red-600" : actualHours < budgetedHours ? "text-green-600" : "text-slate-500")}>
              {actualHours > budgetedHours ? "+" : ""}{(actualHours - budgetedHours).toFixed(2)}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      )}

      {/* Men */}
      {isVisible("men") && (
        <td className="px-1 py-1 text-center text-slate-400" onClick={(e) => e.stopPropagation()}>
          <input
            type="number"
            min={0}
            value={menVal}
            onChange={(e) => setMenVal(e.target.value)}
            onBlur={() => saveMenCount(menVal)}
            className="w-10 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-xs text-slate-600 hover:border-slate-200 focus:border-brand-400 focus:outline-none"
          />
        </td>
      )}

      {/* Qty */}
      {isVisible("qty") && (
        <td className="px-2 py-2 text-right text-slate-400">
          {visit.qty != null ? visit.qty.toFixed(1) : "—"}
        </td>
      )}

      {/* Rate */}
      {isVisible("rate") && (
        <td className="px-2 py-2 text-right text-slate-500">
          {effectiveRate != null ? formatCurrency(effectiveRate) : "—"}
        </td>
      )}

      {/* Amt */}
      {isVisible("amt") && (
        <td className="px-2 py-2 text-right font-medium text-slate-700">
          {effectiveRate != null ? formatCurrency(effectiveRate) : "—"}
        </td>
      )}

      {/* Icons — full text now renders in the banner row(s) below instead of
          being crammed/truncated into this column. */}
      {isVisible("icons") && (() => {
        const latestComment = visit.jobComments.length > 0 ? visit.jobComments[visit.jobComments.length - 1] : null;
        return (
          <td className="px-2 py-2">
            <div className="flex items-center gap-1.5">
              {crewNoteBanner && (
                <span title={crewNoteBanner} className="shrink-0"><StickyNote className="h-3 w-3 text-amber-400" /></span>
              )}
              {(visit.job?.productTotalCents ?? 0) > 0 && (
                <span title="Has products" className="shrink-0"><Package className="h-3 w-3 text-purple-500" /></span>
              )}
              {visit.job?.callAhead && visit.clientPhone && (
                <a
                  href={`tel:${visit.clientPhone}`}
                  onClick={(e) => e.stopPropagation()}
                  title={`Call ahead: ${visit.job.clientPhone}`}
                  className="text-slate-300 hover:text-green-600 transition-colors shrink-0"
                >
                  <Phone className="h-3 w-3" />
                </a>
              )}
              {latestComment && (
                <span
                  className="shrink-0"
                  title={`${visit.jobComments.length} comment${visit.jobComments.length > 1 ? "s" : ""}: ${latestComment.text}`}
                >
                  <MessageSquareText className="h-3 w-3 text-blue-400" />
                </span>
              )}
            </div>
          </td>
        );
      })()}
    </tr>
    {/* Job Notes intentionally has no banner row here — they can run long
        (see the Job Notes tab) and would clog up the board; the sticky-note
        icon above with its tooltip is the only on-board indicator. Job
        Comments (short scheduling remarks) still get the full banner below. */}
    {visit.jobComments.map((c) => (
      <tr key={c.id} className="border-b border-slate-100 bg-orange-50/70">
        <td colSpan={totalCols} className="px-3 py-1.5 text-[11px] text-slate-600">
          <span className="font-medium text-slate-500">{c.text}</span>
          <span className="ml-2 text-slate-400">{relativeTime(c.createdAt)} by {c.authorName}</span>
        </td>
      </tr>
    ))}
    </>
  );
}

// Same per-service rate fallback VisitRow's own Amt/Rate cells use — a
// recurring job's price usually comes from its linked crm_job_services row,
// not visit.rateCents or job.rateCents directly. Every aggregate below
// (Totals row, crew stat cards) must apply this same fallback or those jobs
// silently contribute $0, understating the total by whatever fraction of
// visits price this way (the common case).
function visitAmountCents(visit: CRMJobVisit): number {
  const job = visit.job;
  const services = job?.services ?? [];
  const linkedService = visit.jobServiceId ? services.find((s) => s.id === visit.jobServiceId) : null;
  const serviceTotal = linkedService
    ? (linkedService.rateCents ?? 0) * (linkedService.qty ?? 1)
    : services.reduce((s, svc) => s + (svc.rateCents ?? 0) * (svc.qty ?? 1), 0);
  return visit.rateCents ?? (linkedService ? serviceTotal : (job?.rateCents ?? serviceTotal));
}

// ── totals row ─────────────────────────────────────────────────────────────────

function TotalsRow({ visits, isVisible }: { visits: CRMJobVisit[]; isVisible: (col: ColKey) => boolean }) {
  const totalBHrs = visits.reduce((s, v) => s + (computeBudgetedHours(v) ?? 0), 0);
  const totalAct  = visits.reduce((s, v) => s + (computeActualHours(v) ?? 0), 0);
  const totalAmt  = visits.reduce((s, v) => s + visitAmountCents(v), 0);

  // Fixed always-visible cols: checkbox(1), #(1), St(1), Client(1) = 4
  // Toggleable cols that appear before B Hrs:
  const preHrsKeys: ColKey[] = ["service", "date", "city", "zip", "assigned", "last_svc", "start", "end"];
  const labelSpan = 4 + preHrsKeys.filter((k) => isVisible(k)).length;

  return (
    <tr className="bg-slate-100 text-[10px] font-semibold text-slate-700">
      <td colSpan={labelSpan} className="px-2 py-1.5 text-right text-slate-500">Totals</td>
      {isVisible("b_hrs")   && <td className="px-2 py-1.5 text-right">{totalBHrs > 0 ? totalBHrs.toFixed(2) : "—"}</td>}
      {isVisible("actual")  && <td className="px-2 py-1.5 text-right">{totalAct  > 0 ? totalAct.toFixed(2)  : "—"}</td>}
      {isVisible("variance") && (
        <td className={cn("px-2 py-1.5 text-right", totalAct > 0 && totalAct > totalBHrs ? "text-red-600" : totalAct > 0 && totalAct < totalBHrs ? "text-green-600" : "")}>
          {totalAct > 0 ? `${totalAct > totalBHrs ? "+" : ""}${(totalAct - totalBHrs).toFixed(2)}` : "—"}
        </td>
      )}
      {isVisible("men")     && <td />}
      {isVisible("qty")     && <td />}
      {isVisible("rate")    && <td />}
      {isVisible("amt")     && <td className="px-2 py-1.5 text-right">{totalAmt > 0 ? formatCurrency(totalAmt) : "—"}</td>}
      {isVisible("icons")   && <td />}
    </tr>
  );
}

// ── filter tabs ───────────────────────────────────────────────────────────────

type FilterTab = "all" | "scheduled" | "dispatched" | "completed" | "cancelled" | "skipped";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all",        label: "All" },
  { value: "scheduled",  label: "Scheduled" },
  { value: "dispatched", label: "Dispatched" },
  { value: "completed",  label: "Completed" },
  { value: "cancelled",  label: "Cancelled" },
  { value: "skipped",    label: "Skipped" },
];

// ── helpers ───────────────────────────────────────────────────────────────────

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const day  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][date.getDay()];
  const mo   = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m - 1];
  return `${day} ${mo} ${String(d).padStart(2,"0")}, ${y}`;
}

// ── main board ─────────────────────────────────────────────────────────────────

export function DispatchBoard() {
  const [selectedDate,    setSelectedDate]    = useState(() => toLocalDateString(new Date()));
  const [endDate,         setEndDate]         = useState("");
  const [crewFilters,     setCrewFilters]     = useState<string[]>([]);
  const [statusFilter,    setStatusFilter]    = useState<FilterTab>("all");
  const [search,          setSearch]          = useState("");
  // IDs, not the visit objects themselves — looked up fresh from `visits` on
  // every render (below) so the sheet/dialog always reflects the latest
  // fetched data. Storing the object itself would freeze it at whatever it
  // was when the row was clicked, so an edit made on the row (or a refetch
  // after any save) would never show up if the sheet was opened before that
  // update landed — it'd keep showing what the visit looked like at click time.
  const [detailVisitId,    setDetailVisitId]    = useState<string | null>(null);
  const [editTimesVisitId, setEditTimesVisitId] = useState<string | null>(null);
  const [teamAssignOpen,  setTeamAssignOpen]  = useState(false);
  const [selectedIds,     setSelectedIds]     = useState<Set<string>>(new Set());
  const [colFilterKey,    setColFilterKey]    = useState<string | null>(null);
  const [colFilterValue,  setColFilterValue]  = useState("");
  const [dragId,          setDragId]          = useState<string | null>(null);
  const [dragOverId,      setDragOverId]      = useState<string | null>(null);
  const [manualOrder,     setManualOrder]     = useState<string[] | null>(null);
  // Off by default — rows are only draggable/reorderable once explicitly turned
  // on. Without this gate, every row is a native `draggable` element, so
  // clicking into a Start/End time input to position the cursor can itself
  // register as a drag gesture starting on that row, pinning a "changed"
  // order (identical to the current one) and popping the Save/Clear Order
  // bar despite nothing actually having moved.
  const [manualRouteMode, setManualRouteMode] = useState(false);
  const [visibleKeys,     setVisibleKeys]     = useState<string[]>(COL_DEFS.map((d) => d.key));
  const [statsOpen,       setStatsOpen]       = useState(false);
  const [callAheadOpen,   setCallAheadOpen]   = useState(false);
  const [printOpen,       setPrintOpen]       = useState(false);
  const [chemicalWizardOpen, setChemicalWizardOpen] = useState(false);
  const [nearbyOpen,       setNearbyOpen]       = useState(false);

  // Move-to-day dialog state
  const [moveDayDate, setMoveDayDate] = useState("");
  const [moveDayOpen, setMoveDayOpen] = useState(false);

  // Route optimization state
  const [optimizing,         setOptimizing]         = useState(false);
  const [optimizedOrder,     setOptimizedOrder]     = useState<string[] | null>(null);
  const [driveTimeMap,       setDriveTimeMap]       = useState<Map<string, number>>(new Map());
  const [totalDriveMins,     setTotalDriveMins]     = useState<number | null>(null);

  const effectiveEnd = endDate || undefined;
  const { data: visits, isLoading, refetch } = useVisitsForDate(selectedDate, effectiveEnd);
  const { data: crews }             = useCRMCrews();
  const { data: allServices }       = useCRMServices();
  // Batched by date, not per-row — every VisitRow needs its own visit's member
  // times to detect per-member time divergence, and firing one query per
  // visible row would be its own N+1 problem.
  const { data: allMemberTimes = [] } = useCrewMemberTimesForDate(selectedDate, effectiveEnd);
  const allVisits = visits ?? [];
  // A "stop" (same client/day/crew/address) clocks in and out as one unit —
  // crm_crew_member_times rows are only ever written against the stop's
  // anchor visit (see crew/stops/[visitId]/clock-out), even though every
  // sibling service on that stop has its own crm_job_visits row. Looking
  // member times up by each row's OWN id left every non-anchor visit with an
  // empty roster (blank per-employee times) and, worse, made edits from a
  // sibling row seed a brand-new set of member-time rows under the wrong
  // visit id instead of reusing the shared ones. Resolve every visit to its
  // stop's anchor id first so reads and writes agree on one place per stop.
  const anchorVisitIdByVisitId = useMemo(() => {
    const m = new Map<string, string>();
    for (const stop of groupVisitsIntoStops(allVisits)) {
      for (const v of stop.visits) m.set(v.id, stop.anchorVisitId);
    }
    return m;
  }, [allVisits]);
  const memberTimesByAnchorId = useMemo(() => {
    const m = new Map<string, CrewMemberTime[]>();
    for (const t of allMemberTimes) {
      const arr = m.get(t.visitId);
      if (arr) arr.push(t); else m.set(t.visitId, [t]);
    }
    return m;
  }, [allMemberTimes]);
  const memberTimesByVisitId = useMemo(() => {
    const m = new Map<string, CrewMemberTime[]>();
    for (const visit of allVisits) {
      const anchorId = anchorVisitIdByVisitId.get(visit.id) ?? visit.id;
      m.set(visit.id, memberTimesByAnchorId.get(anchorId) ?? EMPTY_MEMBER_TIMES);
    }
    return m;
  }, [allVisits, anchorVisitIdByVisitId, memberTimesByAnchorId]);
  const qc = useQueryClient();
  const createVisit = useCreateVisit();
  const { matches: nearbyMatches, loading: nearbyLoading, error: nearbyError, findNearby } = useNearbyWaitingListJobs(3);

  // Derived fresh from the live query every render (not stored as its own
  // state) so the sheet/dialog can never go stale relative to the table.
  const detailVisit    = detailVisitId    ? allVisits.find((v) => v.id === detailVisitId)    ?? null : null;
  const editTimesVisit = editTimesVisitId ? allVisits.find((v) => v.id === editTimesVisitId) ?? null : null;
  // Assigned column shows each crew's team code (Settings > Team) instead of
  // its full name, e.g. "Maintenance 1" -> "MAINT1" — falls back to the name
  // for crews that don't have one set.
  const crewCodeById = new Map((crews ?? []).map((c) => [c.id, c.code]).filter((e): e is [string, string] => !!e[1]));
  // Service column shows each service's configured short code (Settings > Services)
  // instead of its full name, e.g. "Lawn Mowing" -> "MOW" — falls back to the
  // full name for services that don't have one set.
  const serviceCodeById = new Map((allServices ?? []).map((s) => [s.id, s.code]).filter((e): e is [string, string] => !!e[1]));
  const chemicalServiceIds = new Set((allServices ?? []).filter((s) => s.trackChemicals).map((s) => s.id));
  const hasChemicalVisits = allVisits.some((v) =>
    (v.job?.services ?? []).some((s) => s.serviceId && chemicalServiceIds.has(s.serviceId))
  );

  async function handleOptimizeRoute() {
    const targets = filtered.filter((v) => v.job?.serviceAddress);
    if (targets.length < 2) {
      toast.error("Need at least 2 visits with a service address to optimize. Try assigning visits to a crew first.");
      return;
    }
    setOptimizing(true);
    try {
      const res = await fetch("/api/crm/route-optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitIds: targets.map((v) => v.id) }),
      });
      const data = await res.json() as {
        orderedVisitIds?: string[];
        driveTimes?: { visitId: string; minutesToNext: number }[];
        totalDriveMinutes?: number;
        error?: string;
      };
      if (!res.ok || data.error) {
        toast.error(data.error ?? "Route optimization failed");
        return;
      }
      setOptimizedOrder(data.orderedVisitIds ?? null);
      const dtMap = new Map<string, number>();
      for (const dt of data.driveTimes ?? []) dtMap.set(dt.visitId, dt.minutesToNext);
      setDriveTimeMap(dtMap);
      setTotalDriveMins(data.totalDriveMinutes ?? null);
      toast.success(`Route optimized — ${data.totalDriveMinutes} min total drive time`);
    } catch {
      toast.error("Failed to reach route optimizer");
    } finally {
      setOptimizing(false);
    }
  }

  function clearOptimization() {
    setOptimizedOrder(null);
    setDriveTimeMap(new Map());
    setTotalDriveMins(null);
  }

  function isVisible(col: ColKey) { return visibleKeys.includes(col); }

  const filtered = allVisits.filter((v) => {
    if (crewFilters.length > 0 && !crewFilters.includes(v.crewId ?? "")) return false;
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (search) {
      const q   = search.toLowerCase();
      const cli = (v.clientName ?? "").toLowerCase();
      const cty = (v.job?.serviceCity ?? "").toLowerCase();
      const svc = (v.job?.services ?? []).map((s) => s.serviceName).join(" ").toLowerCase();
      if (!cli.includes(q) && !cty.includes(q) && !svc.includes(q)) return false;
    }
    if (colFilterKey && colFilterValue) {
      const q = colFilterValue.toLowerCase();
      switch (colFilterKey) {
        case "client":  if (!(v.clientName ?? "").toLowerCase().includes(q)) return false; break;
        case "service": if (!(v.job?.services ?? []).map((s) => s.serviceName).join(" ").toLowerCase().includes(q)) return false; break;
        case "date":    if (!(v.scheduledDate ?? "").includes(q)) return false; break;
        case "city":    if (!(v.job?.serviceCity ?? "").toLowerCase().includes(q)) return false; break;
        case "zip":     if (!(v.job?.serviceZip ?? "").includes(q)) return false; break;
        case "crew":    if (!(v.crewName ?? "").toLowerCase().includes(q)) return false; break;
      }
    }
    return true;
  });

  // Sort priority: optimizedOrder > manualOrder > default (grouped by crew).
  // Array.sort is stable, so within each crew group visits keep the query's
  // own priority/start_time/created_at order — this only groups, it doesn't
  // reorder inside a crew.
  const activeOrder = optimizedOrder ?? manualOrder;
  const displayVisits = activeOrder
    ? [...filtered].sort((a, b) => {
        const ai = activeOrder.indexOf(a.id);
        const bi = activeOrder.indexOf(b.id);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : [...filtered].sort((a, b) => {
        const an = a.crewName ?? "";
        const bn = b.crewName ?? "";
        if (!an && bn) return 1;
        if (an && !bn) return -1;
        return an.localeCompare(bn);
      });

  // Order numbers and drag/drop reordering are scoped per crew — each crew
  // runs its own separate route, so "#3" should mean the 3rd stop for THAT
  // crew, and reordering one crew's stops must never renumber another's.
  const visitById = new Map(displayVisits.map((v) => [v.id, v]));
  const crewKeyOf = (id: string) => visitById.get(id)?.crewId ?? "unassigned";
  const crewOrderNumById = new Map<string, number>();
  {
    const counters = new Map<string, number>();
    for (const v of displayVisits) {
      const key = v.crewId ?? "unassigned";
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      crewOrderNumById.set(v.id, next);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === displayVisits.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayVisits.map((v) => v.id)));
    }
  }

  function handleReorder(id: string, crewRelativeNewIndex: number) {
    const cur = manualOrder ?? displayVisits.map((v) => v.id);
    const crewKey = crewKeyOf(id);
    const crewIds = cur.filter((vid) => crewKeyOf(vid) === crewKey);
    const from = crewIds.indexOf(id);
    if (from === -1) return;
    const clamped = Math.max(0, Math.min(crewRelativeNewIndex, crewIds.length - 1));
    const reordered = [...crewIds];
    reordered.splice(from, 1);
    reordered.splice(clamped, 0, id);
    // Splice the reordered crew subsequence back in place — every other
    // crew's ids keep their exact existing positions.
    let ptr = 0;
    const next = cur.map((vid) => (crewKeyOf(vid) === crewKey ? reordered[ptr++] : vid));
    setManualOrder(next);
    if (optimizedOrder) { setOptimizedOrder(null); setDriveTimeMap(new Map()); setTotalDriveMins(null); }
  }

  async function handleSaveOrder() {
    const order = manualOrder ?? displayVisits.map((v) => v.id);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await Promise.all(order.map((id, i) => (supabase as any).from("crm_job_visits").update({ priority: i + 1 }).eq("id", id)));
    // Without this, the just-saved priorities only exist in the database —
    // the visits list in memory still has the OLD priority values, so
    // clearing manualOrder (which was the only thing keeping the new order
    // on screen) snapped the table back to how it looked before saving,
    // until something else happened to trigger a refetch.
    await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
    setManualOrder(null);
    toast.success("Route order saved");
  }

  function handleDragStart(id: string) {
    setDragId(id);
    // Initialize manual order from current display order if not set
    if (!manualOrder) setManualOrder(displayVisits.map((v) => v.id));
  }

  function handleDragOver(overId: string) {
    if (!dragId || dragId === overId) return;
    // Each crew runs its own route — dropping a stop into another crew's
    // block here would silently renumber that crew's stops too, so only
    // allow reordering within the same crew (reassigning crew is still done
    // via the Team Assignment dialog, not by dragging rows here).
    if (crewKeyOf(dragId) !== crewKeyOf(overId)) return;
    setDragOverId(overId);
    setManualOrder((prev) => {
      const order = prev ?? displayVisits.map((v) => v.id);
      const from = order.indexOf(dragId);
      const to   = order.indexOf(overId);
      if (from === -1 || to === -1) return order;
      const next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
    // Clear optimized order when manually reordering
    if (optimizedOrder) { setOptimizedOrder(null); setDriveTimeMap(new Map()); setTotalDriveMins(null); }
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOverId(null);
  }

  function handleReverseRoute() {
    const cur = manualOrder ?? displayVisits.map((v) => v.id);
    setManualOrder([...cur].reverse());
    if (optimizedOrder) clearOptimization();
    toast.success("Route order reversed");
  }

  function handleGroupStops() {
    const sorted = [...displayVisits].sort((a, b) => {
      const za = (a.job?.serviceZip ?? "").slice(0, 3);
      const zb = (b.job?.serviceZip ?? "").slice(0, 3);
      return za.localeCompare(zb);
    });
    setManualOrder(sorted.map((v) => v.id));
    if (optimizedOrder) clearOptimization();
    toast.success("Stops grouped by zip code area");
  }

  function handleExportCSV() {
    const headers = ["#","Client","Service","Date","Address","City","Zip","Crew","Start","End","B Hrs","Actual","Men","Rate","Amount"];
    const rows = displayVisits.map((v, i) => {
      const job = v.job;
      const svc = (job?.services ?? []).map((s) => s.serviceName).join("; ");
      const rateCents = (v as any).rateCents ?? job?.rateCents ?? 0;
      return [
        i + 1,
        v.clientName ?? "",
        svc,
        v.scheduledDate ?? "",
        job?.serviceAddress ?? "",
        job?.serviceCity ?? "",
        job?.serviceZip ?? "",
        v.crewName ?? "",
        v.startTime ?? "",
        v.endTime ?? "",
        computeBudgetedHours(v)?.toFixed(2) ?? "",
        computeActualHours(v)?.toFixed(2) ?? "",
        (v as any).menCount ?? "",
        (rateCents / 100).toFixed(2),
        (rateCents / 100).toFixed(2),
      ];
    });
    const csv = [headers, ...rows]
      .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dispatch-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${displayVisits.length} visit${displayVisits.length !== 1 ? "s" : ""}`);
  }

  const completedCount  = filtered.filter((v) => v.status === "completed").length;
  const dispatchedCount = filtered.filter((v) => v.status === "dispatched").length;

  const crewStatsList = (crews ?? []).map((c) => {
    const cv = displayVisits.filter((v) => v.crewId === c.id);
    return {
      id: c.id,
      name: c.name,
      count: cv.length,
      bHrs: cv.reduce((s, v) => s + (computeBudgetedHours(v) ?? 0), 0),
      amt: cv.reduce((s, v) => s + visitAmountCents(v), 0),
    };
  }).filter((s) => s.count > 0);
  const unassignedStatCount  = displayVisits.filter((v) => !v.crewId).length;
  const unassignedStatBHrs   = displayVisits.filter((v) => !v.crewId).reduce((s, v) => s + (computeBudgetedHours(v) ?? 0), 0);
  const unassignedStatAmt    = displayVisits.filter((v) => !v.crewId).reduce((s, v) => s + visitAmountCents(v), 0);

  const callAheadVisits = displayVisits.filter((v) => v.job?.callAhead && v.clientPhone);

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Page header */}
      <PageHeader
        title="Dispatch Board"
        description="Schedule and dispatch daily job visits"
      />

      {/* Week strip + date range + actions */}
      <div className="flex items-center gap-3 px-4 shrink-0">
        <WeekStrip selectedDate={selectedDate} onDateChange={(d) => { setSelectedDate(d); clearOptimization(); }} />

        <div className="flex items-center gap-2 text-xs text-slate-500 ml-2">
          <span className="font-medium">From</span>
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => { setSelectedDate(e.target.value); clearOptimization(); }}
            className="h-7 w-36 text-xs"
          />
          <span className="font-medium">To</span>
          <Input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); clearOptimization(); }}
            className="h-7 w-36 text-xs"
          />
          {endDate && (
            <button
              className="text-slate-400 hover:text-slate-700"
              onClick={() => setEndDate("")}
              title="Clear end date"
            >
              <XIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-9 text-sm gap-1.5 px-3"
            onClick={() => setTeamAssignOpen(true)}
          >
            <Users className="h-4 w-4" />
            Team Assign
          </Button>
          <Button size="sm" variant="outline"
            className={cn("h-9 text-sm gap-1.5 px-3", (optimizedOrder || manualOrder) && "border-brand-400 text-brand-600")}
            onClick={handleOptimizeRoute}
            disabled={optimizing}
          >
            <Route className="h-4 w-4" />
            {optimizing ? "Optimizing…" : optimizedOrder ? "Re-Optimize" : "Optimize Route"}
          </Button>
          <Button size="sm" variant="outline" className="h-9 text-sm gap-1.5 px-3"
            onClick={() => { setNearbyOpen(true); findNearby(allVisits); }}
          >
            <MapPin className="h-4 w-4" />
            Nearby Waiting List
          </Button>
        </div>
      </div>

      {/* Save/Clear Order — its own full-width row so it's never pushed off
          screen by the toolbar above (which can overflow horizontally). */}
      {(optimizedOrder || manualOrder) && (
        <div className="flex items-center justify-between gap-3 border-y border-brand-200 bg-brand-50 px-4 py-2 shrink-0">
          <p className="text-xs font-medium text-brand-700">
            {manualOrder ? "Order changed — not yet saved." : "Route optimized."}
          </p>
          <div className="flex items-center gap-2">
            {manualOrder && (
              <Button size="sm" className="h-7 gap-1.5 px-3 text-xs bg-brand-500 hover:bg-brand-600 text-white" onClick={handleSaveOrder}>
                Save Order
              </Button>
            )}
            <Button size="sm" variant="outline"
              className="h-7 gap-1.5 px-3 text-xs text-red-500 border-red-200"
              onClick={() => { clearOptimization(); setManualOrder(null); }}
            >
              <XIcon className="h-3.5 w-3.5" />
              Clear Order
            </Button>
          </div>
        </div>
      )}

      {/* Select a Filter bar — ABOVE dark bar */}
      <div className="flex items-center gap-1.5 border-b bg-white px-4 py-2 shrink-0">
        <span className="shrink-0 text-xs text-slate-500 font-medium mr-1">Select a Filter:</span>
        <div className="flex items-center gap-1 overflow-x-auto">
          {(["client","service","date","city","zip","crew"] as const).map((key) => {
            const label = key === "client" ? "Client" : key === "service" ? "Service" : key === "date" ? "Date" : key === "city" ? "City" : key === "zip" ? "Zip" : "Crew";
            return (
              <button
                key={key}
                onClick={() => { if (colFilterKey === key) { setColFilterKey(null); setColFilterValue(""); } else { setColFilterKey(key); setColFilterValue(""); } }}
                className={cn(
                  "rounded px-2 py-0.5 text-xs transition-colors whitespace-nowrap",
                  colFilterKey === key ? "bg-brand-100 text-brand-700 font-medium" : "hover:bg-slate-100 text-slate-600"
                )}
              >
                {label}
                {colFilterKey === key && colFilterValue && (
                  <span className="ml-1 text-brand-500">· {colFilterValue}</span>
                )}
              </button>
            );
          })}

          {/* Service: popover with list */}
          {colFilterKey === "service" && (
            <Popover defaultOpen>
              <PopoverTrigger className="sr-only" />
              <PopoverContent className="w-56 p-1" align="start" onInteractOutside={() => { if (!colFilterValue) { setColFilterKey(null); } }}>
                <p className="px-2 py-1 text-[10px] font-semibold uppercase text-slate-400 tracking-wide">Services</p>
                {(allServices ?? []).length === 0 && (
                  <p className="px-2 py-2 text-xs text-slate-400 italic">No services found</p>
                )}
                {(allServices ?? []).map((svc) => (
                  <button
                    key={svc.id}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-100",
                      colFilterValue === svc.name && "bg-brand-50 text-brand-700 font-medium"
                    )}
                    onClick={() => setColFilterValue(colFilterValue === svc.name ? "" : svc.name)}
                  >
                    {svc.name}
                  </button>
                ))}
                <div className="border-t mt-1 pt-1">
                  <button
                    className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-100"
                    onClick={() => { setColFilterKey(null); setColFilterValue(""); }}
                  >
                    <XIcon className="h-3 w-3" /> Clear filter
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Other filters: text input */}
          {colFilterKey && colFilterKey !== "service" && (
            <>
              <Input
                autoFocus
                value={colFilterValue}
                onChange={(e) => setColFilterValue(e.target.value)}
                placeholder={`Filter by ${colFilterKey}…`}
                className="ml-2 h-6 w-44 text-xs"
              />
              <button onClick={() => { setColFilterKey(null); setColFilterValue(""); }} className="text-slate-400 hover:text-slate-600">
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Action buttons — flush right of filter bar */}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Button
            size="sm" variant="outline"
            className={cn("h-7 gap-1.5 px-2.5 text-xs", statsOpen && "border-brand-400 text-brand-700 bg-brand-50")}
            onClick={() => setStatsOpen((o) => !o)}
            title="Show crew stats"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Stats
          </Button>
          <Popover open={callAheadOpen} onOpenChange={setCallAheadOpen}>
            <PopoverTrigger asChild>
              <Button
                size="sm" variant="outline"
                className={cn("h-7 gap-1.5 px-2.5 text-xs", callAheadOpen && "border-brand-400 text-brand-700 bg-brand-50")}
                title="Call ahead required"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                Call Ahead
                {callAheadVisits.length > 0 && (
                  <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-700">
                    {callAheadVisits.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="border-b px-3 py-2">
                <p className="text-xs font-semibold text-slate-700">Call Ahead Required</p>
                <p className="text-[10px] text-slate-400">Jobs in the current view needing a call before arrival</p>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {callAheadVisits.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-slate-400 italic text-center">No call-ahead jobs in view</p>
                ) : (
                  callAheadVisits.map((v) => (
                    <div key={v.id} className="flex items-start justify-between gap-2 border-b px-3 py-2 last:border-b-0 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-800">{v.clientName ?? v.job?.clientName ?? "—"}</p>
                        <p className="truncate text-[10px] text-slate-500">{v.job?.serviceAddress ?? ""}{v.job?.serviceCity ? `, ${v.job.serviceCity}` : ""}</p>
                        <p className="text-[10px] text-slate-400">
                          {new Date(`${v.scheduledDate}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}
                          {v.startTime ? ` · ${v.startTime}` : ""}
                          {v.crewName ? ` · ${v.crewName}` : ""}
                        </p>
                      </div>
                      <a
                        href={`tel:${v.clientPhone}`}
                        className="shrink-0 flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2 py-1 text-[10px] font-medium text-green-700 hover:bg-green-100"
                      >
                        <Phone className="h-3 w-3" />
                        {v.clientPhone}
                      </a>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            size="sm" variant="outline"
            className={cn("h-7 gap-1.5 px-2.5 text-xs", manualRouteMode && "border-brand-400 text-brand-700 bg-brand-50")}
            onClick={() => setManualRouteMode((m) => !m)}
            title="Enable drag-and-drop and manual # editing to reorder stops"
          >
            <GripVertical className="h-3.5 w-3.5" />
            Manual Route
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-xs" onClick={handleReverseRoute} title="Reverse route order">
            <ArrowUpDown className="h-3.5 w-3.5" />
            Reverse
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-xs" onClick={handleGroupStops} title="Group stops by zip area">
            <MapPin className="h-3.5 w-3.5" />
            Group Stops
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-xs" onClick={handleExportCSV} title="Export to CSV">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 px-2.5 text-xs" onClick={() => setPrintOpen(true)} title="Print route sheets">
            <Printer className="h-3.5 w-3.5" />
            Print
          </Button>
        </div>
      </div>

      {/* Dark action bar */}
      <div className="bg-[#4a4a4a] px-4 py-2 flex items-center gap-3 shrink-0">
        {/* Refresh — far left */}
        <button
          onClick={() => { void refetch(); qc.invalidateQueries({ queryKey: ['crm-job-visits'] }); }}
          disabled={isLoading}
          title="Refresh"
          className="h-7 w-7 flex items-center justify-center rounded bg-[#5a5a5a] border border-[#6a6a6a] text-slate-300 hover:text-white transition-colors shrink-0"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
        </button>

        {/* Status filter tabs */}
        <div className="flex items-center">
          {FILTER_TABS.map((t) => {
            const cnt = t.value === "all"
              ? allVisits.length
              : allVisits.filter((v) => v.status === t.value).length;
            return (
              <button
                key={t.value}
                onClick={() => setStatusFilter(t.value)}
                className={cn(
                  "px-2.5 py-1 text-[10px] font-medium rounded transition-colors",
                  statusFilter === t.value
                    ? "bg-white text-slate-800"
                    : "text-slate-300 hover:text-white"
                )}
              >
                {t.label}
                {cnt > 0 && (
                  <span className={cn(
                    "ml-1 rounded-full px-1 text-[9px]",
                    statusFilter === t.value ? "bg-slate-200 text-slate-700" : "bg-slate-600 text-slate-300"
                  )}>
                    {cnt}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Multi-crew filter */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="h-7 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-slate-200 hover:text-white transition-colors">
              <Users className="h-3 w-3" />
              {crewFilters.length === 0 ? "All Crews" : `${crewFilters.length} Crew${crewFilters.length > 1 ? "s" : ""}`}
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-100"
              onClick={() => setCrewFilters([])}
            >
              <Checkbox checked={crewFilters.length === 0} className="h-3.5 w-3.5" />
              All Crews
            </button>
            {(crews ?? []).map((c) => (
              <button
                key={c.id}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-100"
                onClick={() => setCrewFilters((prev) =>
                  prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                )}
              >
                <Checkbox checked={crewFilters.includes(c.id)} className="h-3.5 w-3.5" />
                {c.name}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Chemical Tracking — day close-out wizard, only shown when relevant */}
        {hasChemicalVisits && (
          <button
            onClick={() => setChemicalWizardOpen(true)}
            title="Chemical Tracking"
            className="h-7 flex items-center gap-1.5 rounded bg-[#5a5a5a] border border-[#6a6a6a] px-2.5 text-[10px] text-teal-300 hover:text-teal-100 transition-colors"
          >
            <FlaskConical className="h-3 w-3" />
            Chemical Tracking
          </button>
        )}

        {/* Actions — visible when rows selected */}
        {selectedIds.size > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 flex items-center gap-1.5 rounded bg-brand-600 border border-brand-500 px-2.5 text-[10px] text-white hover:bg-brand-700 transition-colors font-medium">
                <ListChecks className="h-3 w-3" />
                Actions ({selectedIds.size})
                <ChevronDown className="h-2.5 w-2.5 opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {/* Change Status submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">
                  <ListChecks className="mr-2 h-3.5 w-3.5 text-slate-400" />
                  Change Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      className="text-xs"
                      onSelect={async () => {
                        const ids = [...selectedIds];
                        if (opt.value === "completed") {
                          // Use the complete route so the parent job status is also updated
                          await Promise.all(
                            ids.map((id) =>
                              fetch(`/api/crm/visits/${id}/complete`, { method: "POST" })
                            )
                          );
                        } else {
                          await Promise.all(
                            ids.map((id) =>
                              fetch(`/api/crm/visits/${id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: opt.value }),
                              })
                            )
                          );
                        }
                        await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
                        await qc.invalidateQueries({ queryKey: ["crm-jobs"] });
                        setSelectedIds(new Set());
                        toast.success(`Updated ${ids.length} visit${ids.length > 1 ? "s" : ""} to ${opt.label}`);
                      }}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Re-assign Crew submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">
                  <Users className="mr-2 h-3.5 w-3.5 text-slate-400" />
                  Re-assign Crew
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    className="text-xs"
                    onSelect={async () => {
                      const ids = [...selectedIds];
                      await Promise.all(
                        ids.map((id) =>
                          fetch(`/api/crm/visits/${id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ crew_id: null }),
                          })
                        )
                      );
                      await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
                      setSelectedIds(new Set());
                      toast.success(`Unassigned ${ids.length} visit${ids.length > 1 ? "s" : ""}`);
                    }}
                  >
                    Unassigned
                  </DropdownMenuItem>
                  {(crews ?? []).map((c) => (
                    <DropdownMenuItem
                      key={c.id}
                      className="text-xs"
                      onSelect={async () => {
                        const ids = [...selectedIds];
                        await Promise.all(
                          ids.map((id) =>
                            fetch(`/api/crm/visits/${id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ crew_id: c.id }),
                            })
                          )
                        );
                        await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
                        setSelectedIds(new Set());
                        toast.success(`Assigned ${ids.length} visit${ids.length > 1 ? "s" : ""} to ${c.name}`);
                      }}
                    >
                      {c.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSeparator />

              {/* Move to Day */}
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => { setMoveDayDate(selectedDate); setMoveDayOpen(true); }}
              >
                <Calendar className="mr-2 h-3.5 w-3.5 text-slate-400" />
                Move to Day…
              </DropdownMenuItem>

              {/* Move to Top — each crew runs its own separate route (see
                  crewOrderNumById above), so this puts the selected visit(s)
                  first WITHIN THEIR OWN CREW's stops, not first overall. If
                  you select visits on 2 different crews, both end up showing
                  "#1" — one each, for their own crew — not a single #1/#2. */}
              <DropdownMenuItem
                className="text-xs"
                onSelect={() => {
                  // Same splice-in-place approach as handleReorder — move
                  // each crew's selected stops to the front of THAT crew's
                  // own subsequence only. Prepending every selected id to
                  // the front of the whole displayVisits array (the old
                  // behavior) shoved the row to the physical top of the
                  // table above unrelated crews, even though the per-crew
                  // "#" number came out right.
                  let cur = manualOrder ?? displayVisits.map((v) => v.id);
                  const selectedByCrew = new Map<string, string[]>();
                  for (const id of selectedIds) {
                    const key = crewKeyOf(id);
                    if (!selectedByCrew.has(key)) selectedByCrew.set(key, []);
                    selectedByCrew.get(key)!.push(id);
                  }
                  for (const [crewKey, ids] of selectedByCrew) {
                    const crewIds = cur.filter((vid) => crewKeyOf(vid) === crewKey);
                    const rest = crewIds.filter((vid) => !ids.includes(vid));
                    const reordered = [...ids, ...rest];
                    let ptr = 0;
                    cur = cur.map((vid) => (crewKeyOf(vid) === crewKey ? reordered[ptr++] : vid));
                  }
                  setManualOrder(cur);
                  const crewCount = selectedByCrew.size;
                  setSelectedIds(new Set());
                  toast.success(
                    crewCount > 1
                      ? "Moved to the top of each selected crew's route"
                      : "Selected visits moved to top of route"
                  );
                }}
              >
                <Route className="mr-2 h-3.5 w-3.5 text-slate-400" />
                Move to Top of Crew&apos;s Route
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-7 w-44 pl-6 text-xs bg-white border-slate-200 focus-visible:ring-0"
          />
        </div>

        {/* Columns selector — far right of dark bar */}
        <div className="ml-auto">
          <ColumnChooser
            columns={COL_DEFS}
            visibleKeys={visibleKeys}
            onVisibleKeysChange={setVisibleKeys}
          />
        </div>
      </div>

      {/* Stats overlay panel */}
      {statsOpen && (
        <div className="bg-white border-b shadow-sm px-4 py-3 shrink-0">
          <div className="flex items-start gap-3 overflow-x-auto pb-1">
            {crewStatsList.map((s) => (
              <div key={s.id} className="shrink-0 rounded border bg-slate-50 px-3 py-2 min-w-[130px]">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1 truncate">{s.name}</p>
                <p className="text-xl font-bold text-slate-800 leading-none">{s.count}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">jobs</p>
                <div className="mt-1.5 flex flex-col gap-0.5 text-[10px]">
                  <span className="text-slate-600">{s.bHrs.toFixed(1)} B.Hrs</span>
                  <span className="text-green-700 font-semibold">{formatCurrency(s.amt)}</span>
                </div>
              </div>
            ))}
            {unassignedStatCount > 0 && (
              <div className="shrink-0 rounded border border-dashed border-amber-300 bg-amber-50 px-3 py-2 min-w-[130px]">
                <p className="text-[10px] font-bold uppercase tracking-wide text-amber-600 mb-1">Unassigned</p>
                <p className="text-xl font-bold text-slate-800 leading-none">{unassignedStatCount}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">jobs</p>
                <div className="mt-1.5 flex flex-col gap-0.5 text-[10px]">
                  <span className="text-slate-600">{unassignedStatBHrs.toFixed(1)} B.Hrs</span>
                  <span className="text-green-700 font-semibold">{formatCurrency(unassignedStatAmt)}</span>
                </div>
              </div>
            )}
            {crewStatsList.length === 0 && unassignedStatCount === 0 && (
              <p className="text-xs text-slate-400 italic py-1">No visits to summarize</p>
            )}
          </div>
        </div>
      )}

      {/* Count bar */}
      <div className="bg-slate-100 border-b px-4 py-1.5 flex items-center gap-4 text-[11px] shrink-0">
        <span className="font-semibold text-slate-700">
          {isLoading ? "Loading…" : `${filtered.length} Job${filtered.length !== 1 ? "s" : ""} Total`}
        </span>
        {!isLoading && dispatchedCount > 0 && (
          <span className="text-orange-500">{dispatchedCount} dispatched</span>
        )}
        {!isLoading && completedCount > 0 && (
          <span className="text-green-600">{completedCount} completed</span>
        )}
        {optimizedOrder && totalDriveMins !== null && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-blue-700 font-medium">
            <Route className="h-3 w-3" />
            Route optimized · {totalDriveMins} min drive total
          </span>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1200px] text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b text-left text-[10px] font-bold uppercase tracking-wide text-slate-400">
              <th className="w-8 px-2 py-2.5" onClick={toggleSelectAll}>
                <Checkbox
                  checked={displayVisits.length > 0 && selectedIds.size === displayVisits.length}
                  className="h-3.5 w-3.5 cursor-pointer"
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="w-10 px-1 py-2.5">#</th>
              <th className="w-8  px-2 py-2.5">St</th>
              <th className="min-w-[140px] px-2 py-2.5">Client</th>
              {isVisible("service")  && <th className="min-w-[110px] px-2 py-2.5">Service</th>}
              {isVisible("date")     && <th className="px-2 py-2.5">Date</th>}
              {isVisible("city")     && <th className="px-2 py-2.5">City</th>}
              {isVisible("zip")      && <th className="px-2 py-2.5">Zip</th>}
              {isVisible("assigned") && <th className="min-w-[90px] px-2 py-2.5">Assigned</th>}
              {isVisible("last_svc") && <th className="px-2 py-2.5">Last Svc</th>}
              {isVisible("start")    && <th className="px-2 py-2.5">Start</th>}
              {isVisible("end")      && <th className="px-2 py-2.5">End</th>}
              {isVisible("b_hrs")    && <th className="px-2 py-2.5 text-right">B Hrs</th>}
              {isVisible("actual")   && <th className="px-2 py-2.5 text-right">Actual</th>}
              {isVisible("variance") && <th className="px-2 py-2.5 text-right">Variance</th>}
              {isVisible("men")      && <th className="px-2 py-2.5 text-center">Men</th>}
              {isVisible("qty")      && <th className="px-2 py-2.5 text-right">Qty</th>}
              {isVisible("rate")     && <th className="px-2 py-2.5 text-right">Rate</th>}
              {isVisible("amt")      && <th className="px-2 py-2.5 text-right">Amt</th>}
              {isVisible("icons")    && <th className="px-2 py-2.5">Notes</th>}
            </tr>
          </thead>
          <tbody>
            {!isLoading && displayVisits.length > 0 && (
              <TotalsRow visits={displayVisits} isVisible={isVisible} />
            )}

            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 20 }).map((__, j) => (
                    <td key={j} className="px-2 py-2.5">
                      <Skeleton className="h-3 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : displayVisits.length === 0 ? (
              <tr>
                <td colSpan={20} className="py-20 text-center text-sm text-slate-400">
                  {search || crewFilters.length > 0 || statusFilter !== "all"
                    ? "No visits match the current filters"
                    : "No visits scheduled for this date"}
                </td>
              </tr>
            ) : (
              displayVisits.map((visit) => (
                <VisitRow
                  key={visit.id}
                  visit={visit}
                  orderNum={crewOrderNumById.get(visit.id) ?? 1}
                  selectedDate={selectedDate}
                  onOpen={(v) => setDetailVisitId(v.id)}
                  onEditTimes={(v) => setEditTimesVisitId(v.id)}
                  driveMinsToNext={driveTimeMap.get(visit.id)}
                  selected={selectedIds.has(visit.id)}
                  onToggleSelect={toggleSelect}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                  isDragOver={dragOverId === visit.id}
                  isVisible={isVisible}
                  onReorder={handleReorder}
                  serviceCodeById={serviceCodeById}
                  crewCodeById={crewCodeById}
                  manualRouteMode={manualRouteMode}
                  memberTimes={memberTimesByVisitId.get(visit.id) ?? EMPTY_MEMBER_TIMES}
                  anchorVisitId={anchorVisitIdByVisitId.get(visit.id) ?? visit.id}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Job detail sheet — looked up fresh by id every render, not the frozen
          object captured at click time, so a save made on the row (or any
          other refetch while the sheet is open) is reflected immediately
          instead of only after closing and reopening it. */}
      {detailVisit && (
        <JobDetailSheet
          visit={detailVisit}
          open={!!detailVisit}
          onOpenChange={(o) => { if (!o) setDetailVisitId(null); }}
          crews={crews ?? []}
          onEditTimes={(v) => setEditTimesVisitId(v.id)}
          memberTimes={memberTimesByVisitId.get(detailVisit.id) ?? EMPTY_MEMBER_TIMES}
          anchorVisitId={anchorVisitIdByVisitId.get(detailVisit.id) ?? detailVisit.id}
        />
      )}

      {/* Edit Job Times — reachable straight from a row, not just via the sheet */}
      {editTimesVisit && (
        <EditJobTimesDialog
          visit={editTimesVisit}
          open={!!editTimesVisit}
          onOpenChange={(o) => { if (!o) setEditTimesVisitId(null); }}
          anchorVisitId={anchorVisitIdByVisitId.get(editTimesVisit.id) ?? editTimesVisit.id}
        />
      )}

      {/* Move to Day dialog */}
      <Dialog open={moveDayOpen} onOpenChange={setMoveDayOpen}>
        <DialogContent className="max-w-xs p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-sm">Move {selectedIds.size} Visit{selectedIds.size !== 1 ? "s" : ""} to Day</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">New Date</label>
              <Input
                type="date"
                value={moveDayDate}
                onChange={(e) => setMoveDayDate(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setMoveDayOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs bg-brand-500 hover:bg-brand-600 text-white"
                disabled={!moveDayDate}
                onClick={async () => {
                  const ids = [...selectedIds];
                  try {
                    const r = await fetch("/api/crm/visits/bulk-update", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ids, updates: { scheduled_date: moveDayDate } }),
                    });
                    if (!r.ok) {
                      const body = await r.json().catch(() => ({}));
                      throw new Error((body as { error?: string }).error ?? `HTTP ${r.status}`);
                    }
                    await qc.invalidateQueries({ queryKey: ["crm-job-visits"] });
                    setSelectedIds(new Set());
                    setMoveDayOpen(false);
                    toast.success(`Moved ${ids.length} visit${ids.length > 1 ? "s" : ""} to ${moveDayDate}`);
                  } catch (err) {
                    toast.error(`Failed to move visits: ${err instanceof Error ? err.message : "unknown error"}`);
                  }
                }}
              >
                Move
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Print dialog */}
      <PrintDialog
        open={printOpen}
        onOpenChange={setPrintOpen}
        visits={displayVisits}
        crews={crews ?? []}
        selectedDate={selectedDate}
      />

      {/* Chemical Tracking wizard — day close-out */}
      <ChemicalTrackingWizard
        open={chemicalWizardOpen}
        onOpenChange={setChemicalWizardOpen}
        date={selectedDate}
        visits={allVisits}
      />

      {/* Team assignment dialog */}
      <TeamAssignDialog
        open={teamAssignOpen}
        onOpenChange={setTeamAssignOpen}
        visits={allVisits}
        crews={crews ?? []}
        selectedDate={selectedDate}
      />

      {/* Nearby Waiting List — geo-fenced against today's scheduled route */}
      <Dialog open={nearbyOpen} onOpenChange={setNearbyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nearby Waiting List — {selectedDate}</DialogTitle>
          </DialogHeader>
          {nearbyLoading ? (
            <p className="py-8 text-center text-sm text-slate-500">Checking proximity to today&rsquo;s route…</p>
          ) : nearbyError ? (
            <p className="py-8 text-center text-sm text-red-600">{nearbyError}</p>
          ) : !nearbyMatches || nearbyMatches.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              No waiting-list jobs within 3 miles of today&rsquo;s scheduled visits.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {nearbyMatches.map((m) => (
                <div key={m.jobId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{m.clientName ?? "Unknown client"}</p>
                    <p className="truncate text-xs text-slate-500">{m.address || "No address"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-slate-400">{m.distanceMiles} mi</span>
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-brand-500 hover:bg-brand-600 text-white"
                      onClick={async () => {
                        try {
                          await createVisit.mutateAsync({
                            jobId: m.jobId,
                            clientId: m.clientId,
                            scheduledDate: selectedDate,
                            jobType: "waiting_list",
                          });
                          toast.success(`Added ${m.clientName ?? "job"} to today's schedule`);
                          refetch();
                        } catch {
                          toast.error("Failed to schedule job");
                        }
                      }}
                    >
                      Schedule Today
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
