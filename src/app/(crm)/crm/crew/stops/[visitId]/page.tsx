"use client";

import { RichNotes } from "@/components/shared/RichNotes";
import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseISO, differenceInMinutes } from "date-fns";
import {
  ArrowLeft, MapPin, Phone, Clock, Camera, MessageSquare,
  CheckSquare, Square, AlertTriangle, Play, Square as StopIcon, SkipForward,
  Image as ImageIcon, Send, Loader2, CheckCircle2, Coffee, Sparkles, FlaskConical,
  ClipboardList, Package,
} from "lucide-react";
import {
  useStopDetail,
  useStopPartnerCrews,
  useStopPhotos,
  useCrewTap,
  useVisitChemicals,
  useChemicalConfirmationStatus,
  useConfirmChemicals,
  useCrewChemicalCatalog,
  useCrewConditions,
  useCrewReference,
  type ChemicalConfirmItem,
  useStopClockIn,
  useStopClockOut,
  useStopPause,
  useStopResume,
  useSkipVisit,
  useAcknowledgeNotes,
  useAddCrewNote,
  useUploadVisitPhoto,
  useFieldUpsellServices,
  useSubmitFieldUpsell,
  useStopJobProducts,
  useUseJobProductMaterials,
  useVisitSubitemChecks,
  useToggleSubitemCheck,
  useCrewProductSearch,
  useStopRequisitions,
  useRequestMaterials,
  type StopJobProductMaterial,
  type CrewPickerProduct,
  type VisitRequisitionStatus,
} from "@/lib/hooks/use-crew-app";
import { Input } from "@/components/ui/input";
import {
  AddChemicalForm, ChemicalApplyFields, ChemicalConditionsFields, ChemicalLabel, EMPTY_CONDITIONS, conditionsFromReading, conditionsPayload,
  type ChemApplyEdit, type ConditionsDraft,
} from "@/components/crm/crew/CrewChemicalParts";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/utils";
import { visitServices, isNotesAcknowledgmentCurrent } from "@/lib/utils/visit-stops";
import { budgetCountdown } from "@/lib/crew/budget-countdown";
import { isPhaseCaption, phaseCaption } from "@/lib/crew/required-photos";
import { TimeSummaryDialog } from "@/components/crm/crew/TimeSummaryDialog";
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { openInMaps } from "@/lib/utils/maps";
import { useConfirm } from "@/components/shared/useConfirm";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { useCurrentUserStore } from "@/stores";
import { toast } from "sonner";
import { t } from "@/lib/crew-i18n";

const REQUISITION_STATUS_STYLE: Record<VisitRequisitionStatus, { label: string; className: string }> = {
  draft: { label: "Submitted", className: "bg-amber-100 text-amber-700" },
  pending_approval: { label: "Pending approval", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Approved", className: "bg-green-100 text-green-700" },
  rejected: { label: "Rejected", className: "bg-red-100 text-red-700" },
  ordered: { label: "Ordered", className: "bg-green-100 text-green-700" },
  closed: { label: "Closed", className: "bg-slate-100 text-slate-600" },
};

/**
 * One row of the "Materials called for" card — mirrors crew-app's
 * PendingMaterialRow/ResolvedMaterialRow (visit/[id].tsx). Pending rows let
 * the crew confirm or correct the actual quantity used against what the
 * office planned; resolved rows are read-only.
 */
function PlannedMaterialRow({
  material,
  onMarkUsed,
  onMarkNotUsed,
  onMarkUsedNoInvoice,
  isSaving,
}: {
  material: StopJobProductMaterial;
  onMarkUsed: (material: StopJobProductMaterial, usedQty: number) => void;
  onMarkNotUsed: (material: StopJobProductMaterial) => void;
  onMarkUsedNoInvoice: (material: StopJobProductMaterial, usedQty: number) => void;
  isSaving: boolean;
}) {
  const [qtyText, setQtyText] = useState(String(material.plannedQty));
  const parsedQty = Number(qtyText);
  // Strictly positive: zero isn't "used none", it's Not Used, and the route
  // rejects it — don't let the button offer an action that can only fail.
  const isValid = qtyText.trim() !== "" && Number.isFinite(parsedQty) && parsedQty > 0;

  if (material.status !== "pending") {
    const resolved = material.status === "not_used"
      ? { label: "Not used", className: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400" }
      : material.status === "used_no_invoice"
        ? { label: `Used: ${material.qty} (not billed)`, className: "bg-muted text-slate-600 dark:text-neutral-400" }
        : { label: `Used: ${material.qty}`, className: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" };
    return (
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-700 dark:text-neutral-300 truncate">{material.productName}</p>
          <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">{t("Called for: {q}", { q: material.plannedQty })}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${resolved.className}`}>
          {resolved.label}
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-700 dark:text-neutral-300">{material.productName}</p>
        <p className="text-xs text-slate-400 dark:text-neutral-500">{t("Called for: {q}", { q: material.plannedQty })}</p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={qtyText}
          onChange={(e) => setQtyText(e.target.value)}
          className="w-20 h-8 text-sm"
        />
        {/* Mark Used keeps the material billable — the office called for it,
            the client pays for it. The two links beside it are the
            deliberate exceptions, and are styled as secondary for that
            reason. */}
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700"
          disabled={!isValid || isSaving}
          onClick={() => onMarkUsed(material, parsedQty)}
        >
          {t("Mark Used")}
        </Button>
        <button
          className="min-h-11 px-2 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300 disabled:opacity-50"
          disabled={!isValid || isSaving}
          onClick={() => onMarkUsedNoInvoice(material, parsedQty)}
        >
          {t("Used — don't bill")}
        </button>
        <button
          className="min-h-11 px-2 text-xs text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300 disabled:opacity-50"
          disabled={isSaving}
          onClick={() => onMarkNotUsed(material)}
        >
          {t("Not Used")}
        </button>
      </div>
    </div>
  );
}

function ElapsedTimer({ start }: { start: string }) {
  const [, forceUpdate] = useState(0);
  // Refresh every minute
  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const mins = differenceInMinutes(new Date(), parseISO(start));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <span>{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>;
}

export default function CrewStopDetailPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId: anchorVisitId } = use(params);
  const router = useRouter();
  const { data: stop, isLoading, isError: stopLoadError, error: stopErr, refetch: refetchStop } = useStopDetail(anchorVisitId);
  const tap = useCrewTap();
  const { format: orgFormat } = useOrgDates();
  // Times read on the org's wall clock, not the phone's.
  const clock = (iso: string) => orgFormat(iso, { hour: "numeric", minute: "2-digit" });
  const { currentUser } = useCurrentUserStore();
  const { data: partnerCrews } = useStopPartnerCrews(stop?.visits ?? []);
  const partners = [...new Set((stop?.visits ?? []).flatMap((v) => partnerCrews?.get(v.id) ?? []))];
  const stopVisitIds = stop?.visits.map((v) => v.id) ?? [];
  const { data: photos = [] } = useStopPhotos(stopVisitIds);
  const { data: chemicals = [] } = useVisitChemicals(stopVisitIds);
  // A service the crew skipped (or the office cancelled) is not being applied, so
  // its chemicals are neither "what to mix" nor something to confirm — and the
  // server's completion gate only looks at the visits still being closed out, so
  // counting them here blocked Stop Job on a chemical for work that was never done.
  const visitStatusById = new Map((stop?.visits ?? []).map((v) => [v.id, v.status as string]));
  const usedChemicals = chemicals.filter((c) => c.used && !["skipped", "cancelled"].includes(visitStatusById.get(c.visitId) ?? ""));
  // Preloaded chemicals are only the PLANNED amount until the crew confirms what
  // was actually used (amount, or "Not used"). Confirmation gates completing the
  // stop when the company requires it — the server enforces it either way.
  const unconfirmedChemicals = chemicals.filter(
    (c) => c.preloaded && !c.confirmedAt && !["skipped", "cancelled", "completed"].includes(visitStatusById.get(c.visitId) ?? "")
  );
  const { data: chemConfirmStatus } = useChemicalConfirmationStatus(stopVisitIds);
  const confirmChemicals = useConfirmChemicals();
  const [chemEdits, setChemEdits] = useState<Record<string, { amount: string; notUsed: boolean }>>({});
  const [chemConditions, setChemConditions] = useState<ConditionsDraft>(EMPTY_CONDITIONS);
  const [chemApply, setChemApply] = useState<Record<string, ChemApplyEdit>>({});
  // The visit a crew-added chemical is recorded against: the one that already carries the
  // stop's chemicals, else the first visit of the stop.
  const chemAddVisitId = chemicals[0]?.visitId ?? stop?.visits[0]?.id;
  const { data: crewDocs = [] } = useCrewReference();
  const docsFor = (productId: string | null) => (productId ? crewDocs.filter((d) => d.productIds.includes(productId)) : []);
  // A stop with nothing preloaded still needs a way to record a chemical the crew decides
  // to apply; offered only while the stop is open and only if the company tracks chemicals.
  const stopOpen = stop?.derivedStatus === "in_progress" || stop?.derivedStatus === "scheduled";
  const noChemicalCards = unconfirmedChemicals.length === 0 && usedChemicals.length === 0;
  const { data: chemCatalog } = useCrewChemicalCatalog(
    unconfirmedChemicals.length > 0 || (noChemicalCards && stopOpen) ? chemAddVisitId : undefined
  );
  // Weather from the National Weather Service fills the conditions once, so the crew only
  // corrects it rather than typing it; "Update" re-applies the reading.
  const { data: chemWeather } = useCrewConditions(unconfirmedChemicals.length > 0 ? chemAddVisitId : undefined);
  const weatherAppliedRef = useRef(false);
  useEffect(() => {
    const reading = chemWeather?.reading;
    if (reading && !weatherAppliedRef.current) {
      weatherAppliedRef.current = true;
      setChemConditions((prev) => conditionsFromReading(reading, prev));
    }
  }, [chemWeather]);
  const waived = new Set(chemConfirmStatus?.waivedVisitIds ?? []);
  const chemBlocked =
    (chemConfirmStatus?.mode ?? "crew_required") === "crew_required" &&
    unconfirmedChemicals.some((c) => !waived.has(c.visitId));
  function chemEditFor(c: { id: string; chemicalAmount: number | null }) {
    return chemEdits[c.id] ?? { amount: c.chemicalAmount != null ? String(c.chemicalAmount) : "", notUsed: false };
  }
  async function handleConfirmChemicals() {
    const items: ChemicalConfirmItem[] = [];
    for (const c of unconfirmedChemicals) {
      const e = chemEditFor(c);
      if (e.notUsed) {
        items.push({ id: c.id, used: false });
        continue;
      }
      const amount = parseFloat(e.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error(`Enter how much ${c.productName ?? "chemical"} was used, or mark it Not used`);
        return;
      }
      // Only what the crew actually changed is sent; the rest stays as the office planned it.
      const apply = chemApply[c.id];
      items.push({
        id: c.id,
        used: true,
        chemicalAmount: amount,
        ...(apply?.methodId !== undefined ? { applicationMethodId: apply.methodId } : {}),
        ...(apply?.targetIds !== undefined ? { targetIds: apply.targetIds } : {}),
        ...(apply?.areasTreatedIds !== undefined ? { areasTreatedIds: apply.areasTreatedIds } : {}),
      });
    }
    await confirmChemicals.mutateAsync({ items, conditions: conditionsPayload(chemConditions) });
    toast.success(t("Chemicals confirmed"));
  }
  const { data: orgSettings } = useOrgSettings();
  const hidePricing = orgSettings?.crewHidePricing ?? false;

  const stopClockIn  = useStopClockIn();
  const stopClockOut = useStopClockOut();
  const stopPause    = useStopPause();
  const stopResume   = useStopResume();
  const skipVisit     = useSkipVisit();
  const acknowledge   = useAcknowledgeNotes();
  const addNote       = useAddCrewNote();
  const uploadPhoto   = useUploadVisitPhoto();
  // Photos taken with no signal stay queued (paused) until it returns; counting
  // them instead of reading uploadPhoto.isPending keeps Add Photo usable for
  // the next shot instead of locking it behind the first one.
  const [photosUploading, setPhotosUploading] = useState(0);
  const { data: upsellServices = [] } = useFieldUpsellServices();
  const submitUpsell  = useSubmitFieldUpsell();
  // Every visit of the stop, not just the anchor: a stop can combine services
  // (each with its own materials) or whole jobs (Mowing + a one-off Mulch job).
  const { data: jobProducts = [] } = useStopJobProducts(stopVisitIds);
  const useMaterials  = useUseJobProductMaterials();
  const { data: subitemChecks } = useVisitSubitemChecks((stop?.visits ?? []).map((sv) => sv.id));
  const toggleSubitem = useToggleSubitemCheck();
  const [confirm, confirmDialog] = useConfirm();
  const { data: requisitions = [] } = useStopRequisitions(stopVisitIds);
  const requestMaterials = useRequestMaterials();
  // A requisition is filed against one job (its cost lands there). When the stop
  // spans several jobs the crew picks which; one visit per job stands for it.
  const requestJobChoices = (() => {
    const byJob = new Map<string, { visitId: string; label: string[] }>();
    for (const sv of stop?.visits ?? []) {
      const entry = byJob.get(sv.jobId) ?? { visitId: sv.id, label: [] };
      entry.label.push(...visitServices(sv).map((x) => x.serviceName).filter(Boolean));
      byJob.set(sv.jobId, entry);
    }
    return [...byJob.values()].map((e) => ({ visitId: e.visitId, label: [...new Set(e.label)].join(", ") || t("This job") }));
  })();
  const [requestVisitId, setRequestVisitId] = useState<string | null>(null);

  const [requestOpen, setRequestOpen]       = useState(false);
  const [productQuery, setProductQuery]     = useState("");
  const [pickedProduct, setPickedProduct]   = useState<CrewPickerProduct | null>(null);
  const [requestQty, setRequestQty]         = useState("1");
  const [requestNote, setRequestNote]       = useState("");
  const { data: productResults = [], isFetching: searchingProducts } = useCrewProductSearch(productQuery, requestOpen);

  const [noteText, setNoteText]       = useState("");
  const [upsellOpen, setUpsellOpen]       = useState(false);
  const [upsellServiceId, setUpsellServiceId] = useState("");
  const [upsellNote, setUpsellNote]       = useState("");
  const [upsellPhoto, setUpsellPhoto]     = useState<File | null>(null);
  const [timeSummaryOpen, setTimeSummaryOpen] = useState(false);
  const [skipReason, setSkipReason]   = useState("");
  const [skipTargetId, setSkipTargetId] = useState<string | null>(null);
  const [clockOutNotes, setClockOutNotes] = useState("");
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [photoUrls, setPhotoUrls]     = useState<Record<string, string>>({});

  const anchor = stop?.visits.find(v => v.id === anchorVisitId) ?? stop?.visits[0];
  const hasNotes = !!stop?.notesToCrew;
  // Re-arms when the office edits the notes after the crew acknowledged them:
  // an acknowledgment older than the notes' own updated stamp no longer
  // counts, so "Acknowledged 7:02 AM" can't sit over a 9:40 AM "DOG IS
  // LOOSE". The clock-in route enforces the same rule server-side — this is
  // only the affordance.
  const acknowledged = isNotesAcknowledgmentCurrent(
    anchor?.acknowledgedNotesAt,
    stop?.notesToCrewUpdatedAt
  );
  const isActive = stop?.derivedStatus === "in_progress";
  // Budget left on the running job. The timer component ticks each minute, but
  // this reads the clock at render, so re-render on the same cadence.
  const [, setBudgetTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setBudgetTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const countdown =
    stop && isActive && stop.clockedInAt && !stop.pausedAt
      ? budgetCountdown({
          budgetedHours: stop.visits
            .filter((v) => !["skipped", "cancelled", "completed"].includes(v.status))
            .map((v) => visitServices(v)[0]?.budgetedHours),
          clockedInAt: stop.clockedInAt,
          // Written to every live visit in the stop alike, so any one carries it.
          breakMinutes: Math.max(0, ...stop.visits.map((v) => v.breakMinutes ?? 0)),
        })
      : null;
  // Cancelled is terminal too: it used to offer a big Start Job that only got a server error.
  const isComplete = stop?.derivedStatus === "completed" || stop?.derivedStatus === "skipped" || stop?.derivedStatus === "cancelled";
  const isPaused = isActive && !!stop?.pausedAt;

  function openMaps() {
    if (!stop?.address) return;
    // City alone ("120 Main St, Springfield") can route to the wrong town.
    openInMaps(stop.fullAddress || stop.address);
  }

  // Each hook's onError already toasts the failure; swallow the rejection here
  // so it isn't also reported as an unhandled promise rejection.
  async function handleClockIn() {
    try {
      await stopClockIn.mutateAsync({ anchorVisitId, tap: tap() });
    } catch {
      /* surfaced by the mutation's onError */
    }
  }

  async function handlePause() {
    try {
      await stopPause.mutateAsync({ anchorVisitId, tap: tap() });
    } catch {
      /* surfaced by the mutation's onError */
    }
  }

  async function handleResume() {
    try {
      await stopResume.mutateAsync({ anchorVisitId, tap: tap() });
    } catch {
      /* surfaced by the mutation's onError */
    }
  }

  async function handleClockOut() {
    try {
      await stopClockOut.mutateAsync({ anchorVisitId, notes: clockOutNotes || undefined, tap: tap() });
    } catch {
      return; // surfaced by the mutation's onError; stay on the stop
    }
    setClockOutOpen(false);
    // Time summary first (SA's post-completion review); it navigates on close.
    setTimeSummaryOpen(true);
  }

  async function handleSkip() {
    if (!skipTargetId || !skipReason.trim()) return;
    try {
      await skipVisit.mutateAsync({ visitId: skipTargetId, reason: skipReason });
    } catch {
      return; // surfaced by the mutation's onError; keep the dialog open
    }
    setSkipTargetId(null);
    setSkipReason("");
  }

  async function handleAcknowledge() {
    try {
      await acknowledge.mutateAsync(anchorVisitId);
    } catch {
      /* surfaced by the mutation's onError */
    }
  }

  async function handleSendNote() {
    if (!noteText.trim()) return;
    try {
      await addNote.mutateAsync({ visitId: anchorVisitId, note: noteText });
    } catch {
      return; // surfaced by the mutation's onError; keep the draft
    }
    setNoteText("");
  }

  async function handleSubmitUpsell() {
    if (!upsellServiceId) return;
    try {
      const res = await submitUpsell.mutateAsync({
        visitId: anchorVisitId,
        serviceId: upsellServiceId,
        note: upsellNote,
        file: upsellPhoto,
      });
      // The photo is best-effort server-side — say so rather than implying it
      // went through, since a crew can't tell from here.
      toast.success(
        res.photoAttached || !upsellPhoto
          ? t("Sent to the office — ticket #{n}.", { n: res.ticketNumber })
          : t("Sent to the office — ticket #{n}, but the photo didn't upload.", { n: res.ticketNumber })
      );
      setUpsellOpen(false);
      setUpsellServiceId("");
      setUpsellNote("");
      setUpsellPhoto(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't send the suggestion"));
    }
  }

  function closeRequest() {
    setRequestOpen(false);
    setProductQuery("");
    setPickedProduct(null);
    setRequestQty("1");
    setRequestNote("");
    setRequestVisitId(null);
  }

  async function handleSendRequest() {
    if (!pickedProduct) return;
    // Fractional materials (half a yard of mulch) are fine — 2 decimals, as the route requires.
    const quantity = Math.round((Number(requestQty.replace(",", ".")) || 0) * 100) / 100;
    if (quantity <= 0) {
      toast.error(t("Enter a quantity greater than zero"));
      return;
    }
    try {
      await requestMaterials.mutateAsync({
        visitId: requestVisitId ?? requestJobChoices[0]?.visitId ?? anchorVisitId,
        productItemId: pickedProduct.id,
        quantity,
        note: requestNote.trim() || undefined,
      });
      toast.success(t("Request sent to the office"));
      closeRequest();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't send the request"));
    }
  }

  async function handleMarkUsed(material: StopJobProductMaterial, usedQty: number) {
    try {
      await useMaterials.mutateAsync({ visitId: material.visitId, jobProductId: material.id, usage: { usedQty } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't record materials used"));
    }
  }

  async function handleMarkUsedNoInvoice(material: StopJobProductMaterial, usedQty: number) {
    const confirmed = await confirm({
      title: t("{name} will come out of inventory but won't be added to the client's invoice. Continue?", { name: material.productName }),
      confirmLabel: "Continue",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await useMaterials.mutateAsync({
        visitId: material.visitId,
        jobProductId: material.id,
        usage: { usedQty, noInvoice: true },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't record materials used"));
    }
  }

  async function handleMarkNotUsed(material: StopJobProductMaterial) {
    const confirmed = await confirm({
      title: t("{name} won't be counted as used on this job. Continue?", { name: material.productName }),
      confirmLabel: "Continue",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await useMaterials.mutateAsync({ visitId: material.visitId, jobProductId: material.id, usage: { notUsed: true } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Couldn't record materials used"));
    }
  }

  // Before / After photos the crew has taken this session — counted alongside
  // the confirmed ones so a photo still uploading (no signal) unblocks the buttons.
  const [phasesAdded, setPhasesAdded] = useState<Set<"before" | "after">>(new Set());
  const hasPhase = (phase: "before" | "after") =>
    phasesAdded.has(phase) || photos.some((p) => isPhaseCaption(p.caption, phase));
  const needBeforePhoto = (orgSettings?.crewRequireBeforePhoto ?? false) && !hasPhase("before");
  const needAfterPhoto = (orgSettings?.crewRequireAfterPhoto ?? false) && !hasPhase("after");

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>, phase?: "before" | "after") {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset now, not after the upload: with no signal the upload waits, and
    // until the input is cleared picking the next (or the same) photo fires no
    // change event.
    e.target.value = "";
    setPhotosUploading((n) => n + 1);
    try {
      const result = await uploadPhoto.mutateAsync({
        visitId: anchorVisitId,
        file,
        clientId: crypto.randomUUID(),
        ...(phase ? { caption: phaseCaption(phase) } : {}),
      });
      if (phase) setPhasesAdded((cur) => new Set(cur).add(phase));
      if (result?.signedUrl) {
        setPhotoUrls(prev => ({ ...prev, [result.id]: result.signedUrl }));
      }
    } catch {
      // The mutation's onError already toasted.
    } finally {
      setPhotosUploading((n) => Math.max(0, n - 1));
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400 dark:text-neutral-500" />
      </div>
    );
  }

  if (stopLoadError) {
    // A failed load (signed out, no signal) used to read "Job not found".
    const signedOut = /not authenticated|jwt|session|401/i.test(stopErr instanceof Error ? stopErr.message : String(stopErr ?? ""));
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-3 px-6 text-center">
        <AlertTriangle className="h-8 w-8 text-amber-500" />
        <p className="font-medium text-slate-700 dark:text-neutral-300">{signedOut ? "You're signed out" : "Couldn't load this job"}</p>
        <p className="text-sm text-muted-foreground">{signedOut ? t("Sign in again to keep working.") : t("Check your signal, then try again.")}</p>
        {signedOut ? (
          <Button className="min-h-11" onClick={() => router.push("/login")}>{t("Sign in")}</Button>
        ) : (
          <Button variant="outline" className="min-h-11" onClick={() => void refetchStop()}>{t("Try again")}</Button>
        )}
      </div>
    );
  }

  if (!stop || !anchor) {
    return (
      <div className="flex flex-col items-center justify-center h-dvh gap-3">
        <p className="text-muted-foreground">{t("This job isn't on your crew's schedule")}</p>
        <Button variant="outline" className="min-h-11" onClick={() => router.push("/crm/crew")}>{t("Back")}</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh bg-slate-50 dark:bg-muted/40">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-[env(safe-area-inset-top)] pb-3 sticky top-0 z-10">
        <div className="flex items-start gap-2">
          <button
            onClick={() => router.push("/crm/crew")}
            aria-label={t("Back to today's jobs")}
            className="flex h-11 w-11 shrink-0 items-center justify-center -ml-2 text-muted-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 dark:text-neutral-100 truncate">{stop.clientName ?? "—"}</h1>
            {partners.length > 0 && (
              <p className="text-xs text-violet-700 dark:text-violet-400">
                Shared stop — also on site: {partners.join(", ")}. You clock your own hours.
              </p>
            )}
            {stop.address && (
              // Wraps instead of truncating: the crew needs to read the whole address here.
              <button
                onClick={openMaps}
                className="text-sm text-blue-600 dark:text-blue-400 flex max-w-full min-w-0 items-start gap-1 mt-0.5 py-1 text-left"
              >
                <MapPin className="h-3 w-3 mt-1 shrink-0" />
                <span className="break-words">{stop.fullAddress || stop.address}</span>
              </button>
            )}
            {stop.gateCode && (
              <p className="mt-1 inline-flex items-center gap-2 rounded-md bg-slate-900 dark:bg-neutral-100 px-2.5 py-1 text-base font-bold text-white dark:text-neutral-900">
                Gate code <span className="font-mono tracking-wider">{stop.gateCode}</span>
              </p>
            )}
          </div>
          {stop.clientPhone && (
            <a
              href={`tel:${stop.clientPhone}`}
              aria-label={t("Call the client")}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground"
            >
              <Phone className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>

      <main className="flex-1 px-4 py-4 space-y-4 pb-8">
        {/* Clock status */}
        {isActive && stop.clockedInAt && (
          isPaused && stop.pausedAt ? (
            <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                  <Coffee className="h-3.5 w-3.5" />
                  {t("On Break")}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Since {clock(stop.pausedAt)}
                </p>
              </div>
              <div className="text-blue-700 dark:text-blue-400 font-mono font-bold text-lg">
                <ElapsedTimer start={stop.pausedAt} />
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t("Job Running")}</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Started {clock(stop.clockedInAt)}
                  {countdown && (
                    <span className={countdown.over ? " font-semibold text-red-600 dark:text-red-400" : ""}>
                      {" · "}
                      {countdown.label}
                    </span>
                  )}
                </p>
              </div>
              <div className="text-amber-700 dark:text-amber-400 font-mono font-bold text-lg">
                <ElapsedTimer start={stop.clockedInAt} />
              </div>
            </div>
          )
        )}

        {/* Services checklist — one row per visit in this stop, each its own service */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
            <h2 className="font-semibold text-slate-800 dark:text-neutral-100">
              Services {stop.visits.length > 1 && `(${stop.visits.length})`}
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-neutral-800">
            {stop.visits.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400 dark:text-neutral-500">{t("No services listed")}</p>
            )}
            {stop.visits.map(v => {
              const svc = visitServices(v)[0];
              const budgeted = svc ? svc.budgetedHours * svc.teamSize : null;
              const rowTerminal = v.status === "completed" || v.status === "cancelled" || v.status === "skipped";
              return (
                <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 dark:text-neutral-300 truncate">{svc?.serviceName ?? "Service"}</p>
                    {budgeted != null && (
                      <p className="text-xs text-slate-400 dark:text-neutral-500 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        Budgeted: {budgeted}h
                      </p>
                    )}
                    {/* Products to bring and sub-services to do under this service,
                        copied from the estimate. Names and quantities only — no prices.
                        Sub-services are tickable per visit; products are recorded
                        (used / not used) under Materials called for below. */}
                    {(svc?.subitems ?? []).length > 0 && (
                      <ul className="mt-1.5 space-y-1">
                        {(svc?.subitems ?? []).map((si) => {
                          const isTask = si.type === "subservice";
                          const done = !!subitemChecks?.has(`${v.id}:${si.id}`);
                          return (
                            <li key={si.id} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-neutral-400">
                              {isTask ? (
                                <button
                                  type="button"
                                  disabled={toggleSubitem.isPending || rowTerminal}
                                  onClick={() => toggleSubitem.mutate({ visitId: v.id, subitemId: si.id, checked: !done })}
                                  aria-pressed={done}
                                  aria-label={done ? t("Untick {name}", { name: si.name }) : t("Tick off {name}", { name: si.name })}
                                  className="-my-3 -ml-3 flex h-11 w-11 shrink-0 items-center justify-center disabled:opacity-60"
                                >
                                  {done
                                    ? <CheckSquare className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    : <Square className="h-4 w-4 text-slate-400 dark:text-neutral-500" />}
                                </button>
                              ) : (
                                <Package className="h-3 w-3 shrink-0 text-slate-400 dark:text-neutral-500" />
                              )}
                              <span className={`truncate ${done ? "line-through text-slate-400 dark:text-neutral-500" : ""}`}>{si.name}</span>
                              {si.qty !== 1 && (
                                <span className="shrink-0 text-slate-400 dark:text-neutral-500">× {si.qty.toLocaleString()}</span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!hidePricing && svc?.rateCents != null && (
                      <p className="text-sm text-slate-400 dark:text-neutral-500">{formatCurrency(svc.rateCents)}</p>
                    )}
                    {v.status === "skipped" ? (
                      <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">{t("Skipped")}</span>
                    ) : v.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
                    ) : !rowTerminal ? (
                      <button
                        className="min-h-11 px-2 text-sm text-slate-500 dark:text-neutral-400 hover:text-slate-700 dark:hover:text-neutral-300 flex items-center gap-1"
                        onClick={() => setSkipTargetId(v.id)}
                      >
                        <SkipForward className="h-3 w-3" />
                        {t("Skip")}
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {unconfirmedChemicals.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-amber-100 dark:border-amber-900">
              <h2 className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                {t("Confirm chemicals applied")}
              </h2>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                {chemBlocked
                  ? t("Enter how much was actually used (or mark it Not used) before you can stop this job.")
                  : t("Enter how much was actually used, or mark it Not used.")}
              </p>
            </div>
            <div className="p-3 space-y-2">
              {unconfirmedChemicals.map((c) => {
                const e = chemEditFor(c);
                return (
                  <div key={c.id} className="rounded-lg bg-card border border-border px-3 py-2">
                    <p className="text-sm font-medium text-slate-800 dark:text-neutral-100">{c.productName ?? "Chemical"}</p>
                    {c.chemicalAmount != null ? (
                      <p className="text-xs text-muted-foreground">{t("Planned: {a}", { a: `${c.chemicalAmount} ${c.unitName ?? ""}`.trim() })}</p>
                    ) : (
                      // The office's estimate is rate x the property's area, so no planned amount means
                      // no area (or rate) was on file. Say so rather than leave a blank box.
                      <p className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {t("No amount was planned (no property area or application rate on file). Measure what you apply and enter it.")}
                      </p>
                    )}
                    <ChemicalLabel chemical={c} documents={docsFor(c.productId)} />
                    <ChemicalApplyFields chemical={c} catalog={chemCatalog} edit={chemApply[c.id]} onChange={(next) => setChemApply((prev) => ({ ...prev, [c.id]: next }))} />
                    <div className="mt-2 flex items-center gap-3">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        value={e.notUsed ? "" : e.amount}
                        disabled={e.notUsed}
                        onChange={(ev) => setChemEdits((prev) => ({ ...prev, [c.id]: { ...e, amount: ev.target.value } }))}
                        placeholder={t("Amount used")}
                        className="h-11 w-32 text-base"
                      />
                      <span className="text-sm text-muted-foreground">{c.unitName ?? ""}</span>
                      <label className="ml-auto flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={e.notUsed}
                          onChange={(ev) => setChemEdits((prev) => ({ ...prev, [c.id]: { ...e, notUsed: ev.target.checked } }))}
                          className="h-5 w-5"
                        />
                        {t("Not used")}
                      </label>
                    </div>
                  </div>
                );
              })}
              <ChemicalConditionsFields
                display={chemCatalog?.conditionsDisplay ?? "weather"}
                value={chemConditions}
                onChange={setChemConditions}
                reading={chemWeather?.reading}
                onUseReading={() => chemWeather?.reading && setChemConditions((prev) => conditionsFromReading(chemWeather.reading!, prev))}
              />
              {chemAddVisitId && <AddChemicalForm visitId={chemAddVisitId} disabled={!isActive} sharedConditions={chemConditions} />}
              <Button
                className="w-full h-12 text-base font-bold bg-emerald-600 hover:bg-emerald-700"
                onClick={handleConfirmChemicals}
                disabled={confirmChemicals.isPending || !isActive}
              >
                {confirmChemicals.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirm chemicals"}
              </Button>
              {/* The application record needs a start time: confirming at the yard before
                  Start Job wrote an end time with no start. */}
              {!isActive && (
                <p className="text-center text-xs text-amber-800 dark:text-amber-300">{t("Start the job first — then confirm what was applied.")}</p>
              )}
            </div>
          </div>
        )}

        {/* Chemical mix — what to use and how much finished-mix solution to
            prepare, computed from the product's application rate + dilution
            ratio when the office has it configured. Only shown when this
            stop actually has chemicals logged. */}
        {usedChemicals.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
              <h2 className="font-semibold text-slate-800 dark:text-neutral-100 flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                {t("Chemical Mix")}
              </h2>
            </div>
            <div className="p-3 space-y-2">
              {usedChemicals.map((a) => {
                const visit = stop.visits.find((v) => v.id === a.visitId);
                const serviceName =
                  stop.visits.length > 1 && visit ? visitServices(visit)[0]?.serviceName : undefined;
                return (
                  <div key={a.id} className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900 px-3 py-2">
                    {serviceName && <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-0.5">{serviceName}</p>}
                    <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">{a.productName ?? "Chemical"}</p>
                    {a.solutionAmount != null ? (
                      <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-0.5">
                        Use{" "}
                        <span className="font-semibold">
                          {a.solutionAmount} {a.solutionUnitName ?? ""}
                        </span>{" "}
                        of finished mix
                        {a.chemicalAmount != null && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {" "}
                            ({a.chemicalAmount} {a.unitName ?? ""} active)
                          </span>
                        )}
                      </p>
                    ) : a.chemicalAmount != null ? (
                      <p className="text-sm text-emerald-800 dark:text-emerald-300 mt-0.5">
                        {a.chemicalAmount} {a.unitName ?? ""}
                      </p>
                    ) : null}
                    {a.applicationRateLabel && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{a.applicationRateLabel}</p>
                    )}
                    <ChemicalLabel chemical={a} documents={docsFor(a.productId)} />
                  </div>
                );
              })}
              {/* While chemicals are still unconfirmed the confirm card above carries the add button. */}
              {unconfirmedChemicals.length === 0 && chemAddVisitId && (
                <AddChemicalForm visitId={chemAddVisitId} disabled={!isActive} />
              )}
            </div>
          </div>
        )}

        {noChemicalCards && stopOpen && chemAddVisitId && (chemCatalog?.products.length ?? 0) > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
              <h2 className="font-semibold text-slate-800 dark:text-neutral-100 flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                {t("Chemicals")}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("None were planned for this stop. Add any you apply.")}</p>
            </div>
            <div className="p-3">
              <AddChemicalForm visitId={chemAddVisitId} disabled={!isActive} />
              {!isActive && (
                <p className="mt-2 text-center text-xs text-muted-foreground">{t("Start the job first — then add what you applied.")}</p>
              )}
            </div>
          </div>
        )}

        {/* Notes acknowledgment gate */}
        {hasNotes && (
          <div className={`rounded-xl border overflow-hidden ${acknowledged ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40" : "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40"}`}>
            <div className="px-4 py-3 flex items-start gap-3">
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${acknowledged ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`} />
              <div className="flex-1">
                <p className={`text-sm font-medium ${acknowledged ? "text-green-800 dark:text-green-300" : "text-amber-800 dark:text-amber-300"}`}>
                  {t("Job Notes")}
                </p>
                <RichNotes value={stop.notesToCrew ?? ""} className="text-sm mt-1 text-slate-700 dark:text-neutral-300" />
              </div>
            </div>
            {!acknowledged && (
              <div className="px-4 pb-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  onClick={handleAcknowledge}
                  disabled={acknowledge.isPending}
                >
                  {acknowledge.isPending
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Square className="h-3 w-3" />
                  }
                  I&apos;ve read the notes
                </Button>
              </div>
            )}
            {!acknowledged && anchor.acknowledgedNotesAt && (
              <div className="px-4 pb-3">
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("The office changed these notes after you read them — read them again.")}
                </p>
              </div>
            )}
            {acknowledged && anchor.acknowledgedNotesAt && (
              <div className="px-4 pb-3">
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" />
                  Acknowledged {clock(anchor.acknowledgedNotesAt)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Primary action buttons — sticky at the bottom (above the home indicator) so they
            stay reachable one-handed below a long services / chemicals list. */}
        {!isComplete && (
          <div className="sticky bottom-0 z-10 -mx-4 space-y-2 border-t border-border bg-slate-50/95 dark:bg-background/95 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
            {!isActive ? (
              <>
                <Button
                  className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700 gap-2"
                  onClick={handleClockIn}
                  disabled={stopClockIn.isPending || (hasNotes && !acknowledged) || needBeforePhoto}
                >
                  {stopClockIn.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                  {t("Start Job")}
                </Button>
                {hasNotes && !acknowledged && (
                  <p className="text-center text-xs text-amber-700 dark:text-amber-400">{t("Read the job notes and tap “I've read the notes” to start.")}</p>
                )}
                {needBeforePhoto && (
                  <p className="text-center text-xs text-amber-700 dark:text-amber-400">{t("Take a Before photo (in Photos, below) to start.")}</p>
                )}
              </>
            ) : (
              <>
                {isPaused ? (
                  <Button
                    className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700 gap-2"
                    onClick={handleResume}
                    disabled={stopResume.isPending}
                  >
                    {stopResume.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                    {t("Resume Job")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-14 text-base font-bold gap-2 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
                    onClick={handlePause}
                    disabled={stopPause.isPending}
                  >
                    {stopPause.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Coffee className="h-5 w-5" />}
                    {t("Take a Break")}
                  </Button>
                )}
                <Button
                  className="w-full h-14 text-base font-bold bg-red-600 hover:bg-red-700 gap-2"
                  onClick={() => setClockOutOpen(true)}
                  disabled={chemBlocked || needAfterPhoto}
                >
                  <StopIcon className="h-5 w-5" />
                  {t("Stop Job")}
                </Button>
                {chemBlocked && (
                  <p className="text-center text-xs text-amber-700 dark:text-amber-400">
                    {t("Confirm the chemicals applied (above) to stop this job.")}
                  </p>
                )}
                {needAfterPhoto && (
                  <p className="text-center text-xs text-amber-700 dark:text-amber-400">
                    {t("Take an After photo (in Photos, below) to stop this job.")}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {isComplete && (
          <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-center">
            <p className="font-medium text-green-800 dark:text-green-300">
              {stop.derivedStatus === "skipped" ? t("Job Skipped") : stop.derivedStatus === "cancelled" ? t("Job Cancelled by the office") : t("Job Complete")}
            </p>
            {stop.clockedInAt && stop.clockedOutAt && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                {clock(stop.clockedInAt)} – {clock(stop.clockedOutAt)}
              </p>
            )}
          </div>
        )}

        {/* Photos */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 dark:text-neutral-100 flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Photos {photos.length > 0 && `(${photos.length})`}
            </h2>
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handlePhotoCapture}
              />
              <span className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 font-medium">
                {photosUploading > 0
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Camera className="h-4 w-4" />
                }
                {photosUploading > 1 ? t("Add Photo ({n} uploading)", { n: photosUploading }) : t("Add Photo")}
              </span>
            </label>
          </div>
          {((orgSettings?.crewRequireBeforePhoto ?? false) || (orgSettings?.crewRequireAfterPhoto ?? false)) && (
            <div className="flex flex-wrap gap-2 border-b border-slate-100 dark:border-neutral-800 px-4 py-3">
              {([
                ["before", "Before", orgSettings?.crewRequireBeforePhoto],
                ["after", "After", orgSettings?.crewRequireAfterPhoto],
              ] as const)
                .filter(([, , required]) => required)
                .map(([phase]) => (
                  <label key={phase} className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      onChange={(e) => handlePhotoCapture(e, phase)}
                    />
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${
                        hasPhase(phase)
                          ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-400"
                          : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      <Camera className="h-4 w-4" />
                      {hasPhase(phase) ? t(phase === "before" ? "Before photo added" : "After photo added") : t(phase === "before" ? "Before photo (required)" : "After photo (required)")}
                    </span>
                  </label>
                ))}
            </div>
          )}
          {photos.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400 dark:text-neutral-500 text-center">{t("No photos yet")}</p>
          ) : (
            <div className="grid grid-cols-3 gap-1 p-2">
              {photos.map(photo => (
                <div key={photo.id} className="aspect-square bg-muted rounded-md overflow-hidden">
                  {(photoUrls[photo.id] ?? photo.signedUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrls[photo.id] ?? photo.signedUrl ?? ""}
                      alt={photo.caption ?? t("Visit photo")}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-neutral-500">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Materials called for — office-planned materials (crm_job_products),
            distinct from an ad-hoc new request. Mirrors crew-app's
            PlannedMaterialsSection. */}
        {jobProducts.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
              <h2 className="font-semibold text-slate-800 dark:text-neutral-100 flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                {t("Materials called for")}
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {jobProducts.map((m) => (
                <PlannedMaterialRow
                  key={m.id}
                  material={m}
                  onMarkUsed={handleMarkUsed}
                  onMarkNotUsed={handleMarkNotUsed}
                  onMarkUsedNoInvoice={handleMarkUsedNoInvoice}
                  isSaving={useMaterials.isPending}
                />
              ))}
            </div>
          </div>
        )}

        {/* Materials requests — an ad-hoc ask for something NOT already called
            for on the job. Becomes a draft requisition the office prices and
            approves. Mirrors crew-app's t("Materials requests") card. */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-800 dark:text-neutral-100">{t("Materials requests")}</h2>
            <Button size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
              {t("Request Materials")}
            </Button>
          </div>
          {requisitions.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400 dark:text-neutral-500 text-center">{t("No materials requested for this job.")}</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-neutral-800">
              {requisitions.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 dark:text-neutral-200 truncate">{r.title}</p>
                    <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">{r.requisitionNumber}</p>
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${REQUISITION_STATUS_STYLE[r.status].className}`}>
                    {REQUISITION_STATUS_STYLE[r.status].label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suggest work — hidden unless the office has opened up services for
            crews to suggest, which is how the feature is switched on. */}
        {upsellServices.length > 0 && (
          <button
            onClick={() => setUpsellOpen(true)}
            className="w-full rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-left active:bg-emerald-100 dark:active:bg-emerald-900/40"
          >
            <span className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300">
              <Sparkles className="h-4 w-4" />
              {t("Suggest work")}
            </span>
            <span className="mt-0.5 block text-xs text-emerald-700 dark:text-emerald-400">
              {t("Spotted something this property needs? Send it to the office.")}
            </span>
          </button>
        )}

        {/* Notes / Comments */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800">
            <h2 className="font-semibold text-slate-800 dark:text-neutral-100 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {t("Notes to Office")}
            </h2>
            <p className="text-xs text-slate-400 dark:text-neutral-500 mt-0.5">{t("Visible on the dispatch board")}</p>
          </div>
          {anchor.jobComments && anchor.jobComments.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-neutral-800 bg-slate-50 dark:bg-muted/40">
              {typeof anchor.jobComments === "string" ? (
                <p className="text-sm text-slate-600 dark:text-neutral-400 whitespace-pre-wrap">{anchor.jobComments}</p>
              ) : (
                // Dispatcher remarks and crew notes share this list; say who wrote each one.
                <ul className="space-y-2">
                  {anchor.jobComments.map((c, i) => {
                    const mine = c.authorId === currentUser.id || c.authorName === "Crew";
                    return (
                      <li key={c.id ?? i} className="text-sm">
                        <p className="text-xs font-medium text-slate-500 dark:text-neutral-400">
                          {mine ? "You" : `Office${c.authorName ? ` · ${c.authorName}` : ""}`}
                          {c.createdAt ? ` · ${clock(c.createdAt)}` : ""}
                        </p>
                        <p className="text-slate-700 dark:text-neutral-300 whitespace-pre-wrap">{c.text}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          <div className="p-3 flex gap-2">
            <Textarea
              placeholder={t("Write a note...")}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              className="flex-1 min-h-[80px] resize-none text-sm"
            />
            <Button
              size="icon"
              className="shrink-0 self-end bg-blue-600 hover:bg-blue-700"
              onClick={handleSendNote}
              disabled={!noteText.trim() || addNote.isPending}
            >
              {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </main>

      {/* Request materials — search the stocked/project catalog (never a
          free-text item, and no prices shown), pick a quantity, send. */}
      <Dialog open={requestOpen} onOpenChange={(open) => (open ? setRequestOpen(true) : closeRequest())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pickedProduct ? pickedProduct.name : t("Request materials")}</DialogTitle>
          </DialogHeader>
          {pickedProduct ? (
            <div className="flex flex-col gap-3">
              {requestJobChoices.length > 1 && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-neutral-300">{t("For which job?")}</p>
                  <div className="flex flex-col gap-1.5">
                    {requestJobChoices.map((c) => {
                      const picked = (requestVisitId ?? requestJobChoices[0].visitId) === c.visitId;
                      return (
                        <button
                          key={c.visitId}
                          type="button"
                          onClick={() => setRequestVisitId(c.visitId)}
                          className={`rounded-lg border px-3 py-2.5 text-left text-sm ${picked
                            ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 font-medium"
                            : "border-border active:bg-slate-50 dark:active:bg-muted/40"}`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-neutral-300">{t("Quantity")}</p>
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={requestQty}
                  onChange={(e) => setRequestQty(e.target.value)}
                  className="w-28"
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-neutral-300">{t("Note (optional)")}</p>
                <Textarea
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder={t("Anything the office should know?")}
                  className="min-h-[72px] resize-none text-sm"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPickedProduct(null)}>{t("Back")}</Button>
                <Button onClick={handleSendRequest} disabled={requestMaterials.isPending}>
                  {requestMaterials.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Send to office")}
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder={t("Search materials…")}
                autoFocus
              />
              <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5">
                {searchingProducts && productResults.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">{t("Searching…")}</p>
                )}
                {!searchingProducts && productResults.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">{t("No materials found.")}</p>
                )}
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPickedProduct(p)}
                    className="rounded-lg border border-slate-200 dark:border-neutral-700 px-3 py-2.5 text-left active:bg-slate-50 dark:active:bg-neutral-800"
                  >
                    <span className="block text-sm font-medium text-slate-800 dark:text-neutral-100">{p.name}</span>
                    {p.partNumber && <span className="block text-xs text-slate-500">{p.partNumber}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suggest work — crews never see or set a price here; the office prices
          it from the photo and note. */}
      <Dialog open={upsellOpen} onOpenChange={setUpsellOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Suggest work")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-neutral-300">{t("What does it need?")}</p>
              <div className="flex flex-col gap-1.5">
                {upsellServices.map((svc) => {
                  const picked = upsellServiceId === svc.id;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => setUpsellServiceId(svc.id)}
                      className={`rounded-lg border px-3 py-2.5 text-left ${
                        picked
                          ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40"
                          : "border-border active:bg-slate-50 dark:active:bg-muted/40"
                      }`}
                    >
                      <span className={`block text-sm font-medium ${picked ? "text-emerald-800 dark:text-emerald-300" : "text-slate-800 dark:text-neutral-100"}`}>
                        {svc.name}
                      </span>
                      {svc.upsell_pitch && (
                        <span className="mt-0.5 block text-xs text-muted-foreground">{svc.upsell_pitch}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-neutral-300">
                {t("Anything the office should know?")}
              </p>
              <Textarea
                placeholder={t("e.g. front beds are thin, client mentioned it too")}
                value={upsellNote}
                onChange={(e) => setUpsellNote(e.target.value)}
                className="min-h-[80px] resize-none text-sm"
              />
            </div>

            <div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2.5 active:bg-slate-50 dark:active:bg-muted/40">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setUpsellPhoto(e.target.files?.[0] ?? null)}
                />
                <Camera className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                  {upsellPhoto ? t("Photo attached — tap to replace") : "Add a photo"}
                </span>
              </label>
              <p className="mt-1 text-xs text-slate-400 dark:text-neutral-500">
                {t("A photo usually saves the office a trip out to quote it.")}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpsellOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              onClick={handleSubmitUpsell}
              disabled={!upsellServiceId || submitUpsell.isPending}
            >
              {submitUpsell.isPending ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> {t("Sending…")}</>
              ) : (
                t("Send to office")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TimeSummaryDialog
        open={timeSummaryOpen}
        visitId={anchorVisitId}
        onClose={() => {
          setTimeSummaryOpen(false);
          router.push("/crm/crew");
        }}
      />

      {/* Skip dialog — targets one service row at a time */}
      <Dialog open={!!skipTargetId} onOpenChange={(open) => !open && setSkipTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Skip this service?")}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder={t("Reason for skipping (required)")}
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipTargetId(null)}>{t("Cancel")}</Button>
            <Button
              variant="destructive"
              onClick={handleSkip}
              disabled={!skipReason.trim() || skipVisit.isPending}
            >
              {skipVisit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clock-out dialog */}
      <Dialog open={clockOutOpen} onOpenChange={setClockOutOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Stop Job")}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-slate-600 dark:text-neutral-400">{t("Add any completion notes before finishing.")}</p>
            <p className="text-xs text-slate-500 dark:text-neutral-500">
              {t("Completion notes can appear on the client's invoice, so keep them professional and client-friendly.")}
            </p>
            <Textarea
              placeholder={t("Completion notes (optional)")}
              value={clockOutNotes}
              onChange={e => setClockOutNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClockOutOpen(false)}>{t("Cancel")}</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleClockOut}
              disabled={stopClockOut.isPending}
            >
              {stopClockOut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}
