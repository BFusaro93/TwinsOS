"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, differenceInMinutes } from "date-fns";
import {
  ArrowLeft, MapPin, Phone, Clock, Camera, MessageSquare,
  CheckSquare, Square, AlertTriangle, Play, Square as StopIcon, SkipForward,
  Image as ImageIcon, Send, Loader2, CheckCircle2, Coffee, Sparkles, FlaskConical,
  ClipboardList,
} from "lucide-react";
import {
  useStopDetail,
  useVisitPhotos,
  useVisitChemicals,
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
  useJobProducts,
  useUseJobProductMaterials,
  type JobProductMaterial,
} from "@/lib/hooks/use-crew-app";
import { Input } from "@/components/ui/input";
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
import { useOrgSettings } from "@/lib/hooks/use-org-settings";
import { openInMaps } from "@/lib/utils/maps";
import { useConfirm } from "@/components/shared/useConfirm";
import { toast } from "sonner";

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
  material: JobProductMaterial;
  onMarkUsed: (material: JobProductMaterial, usedQty: number) => void;
  onMarkNotUsed: (material: JobProductMaterial) => void;
  onMarkUsedNoInvoice: (material: JobProductMaterial, usedQty: number) => void;
  isSaving: boolean;
}) {
  const [qtyText, setQtyText] = useState(String(material.plannedQty));
  const parsedQty = Number(qtyText);
  // Strictly positive: zero isn't "used none", it's Not Used, and the route
  // rejects it — don't let the button offer an action that can only fail.
  const isValid = qtyText.trim() !== "" && Number.isFinite(parsedQty) && parsedQty > 0;

  if (material.status !== "pending") {
    const resolved = material.status === "not_used"
      ? { label: "Not used", className: "bg-amber-100 text-amber-700" }
      : material.status === "used_no_invoice"
        ? { label: `Used: ${material.qty} (not billed)`, className: "bg-slate-100 text-slate-600" }
        : { label: `Used: ${material.qty}`, className: "bg-green-100 text-green-700" };
    return (
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-slate-700 truncate">{material.productName}</p>
          <p className="text-xs text-slate-400 mt-0.5">Called for: {material.plannedQty}</p>
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
        <p className="text-sm text-slate-700">{material.productName}</p>
        <p className="text-xs text-slate-400">Called for: {material.plannedQty}</p>
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
          Mark Used
        </Button>
        <button
          className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
          disabled={!isValid || isSaving}
          onClick={() => onMarkUsedNoInvoice(material, parsedQty)}
        >
          Used — don&apos;t bill
        </button>
        <button
          className="text-xs text-slate-400 hover:text-slate-600 disabled:opacity-50"
          disabled={isSaving}
          onClick={() => onMarkNotUsed(material)}
        >
          Not Used
        </button>
      </div>
    </div>
  );
}

function ElapsedTimer({ start }: { start: string }) {
  const [, forceUpdate] = useState(0);
  // Refresh every minute
  useState(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(id);
  });
  const mins = differenceInMinutes(new Date(), parseISO(start));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <span>{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>;
}

export default function CrewStopDetailPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId: anchorVisitId } = use(params);
  const router = useRouter();
  const { data: stop, isLoading } = useStopDetail(anchorVisitId);
  const { data: photos = [] } = useVisitPhotos(anchorVisitId);
  const stopVisitIds = stop?.visits.map((v) => v.id) ?? [];
  const { data: chemicals = [] } = useVisitChemicals(stopVisitIds);
  const usedChemicals = chemicals.filter((c) => c.used);
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
  const { data: upsellServices = [] } = useFieldUpsellServices();
  const submitUpsell  = useSubmitFieldUpsell();
  const { data: jobProducts = [] } = useJobProducts(anchorVisitId);
  const useMaterials  = useUseJobProductMaterials();
  const [confirm, confirmDialog] = useConfirm();

  const [noteText, setNoteText]       = useState("");
  const [upsellOpen, setUpsellOpen]       = useState(false);
  const [upsellServiceId, setUpsellServiceId] = useState("");
  const [upsellNote, setUpsellNote]       = useState("");
  const [upsellPhoto, setUpsellPhoto]     = useState<File | null>(null);
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
  const isComplete = stop?.derivedStatus === "completed" || stop?.derivedStatus === "skipped";
  const isPaused = isActive && !!stop?.pausedAt;

  function openMaps() {
    if (!stop?.address) return;
    openInMaps(stop.address);
  }

  async function handleClockIn() {
    await stopClockIn.mutateAsync(anchorVisitId);
  }

  async function handlePause() {
    await stopPause.mutateAsync(anchorVisitId);
  }

  async function handleResume() {
    await stopResume.mutateAsync(anchorVisitId);
  }

  async function handleClockOut() {
    await stopClockOut.mutateAsync({ anchorVisitId, notes: clockOutNotes || undefined });
    setClockOutOpen(false);
    router.push("/crm/crew");
  }

  async function handleSkip() {
    if (!skipTargetId || !skipReason.trim()) return;
    await skipVisit.mutateAsync({ visitId: skipTargetId, reason: skipReason });
    setSkipTargetId(null);
    setSkipReason("");
  }

  async function handleAcknowledge() {
    await acknowledge.mutateAsync(anchorVisitId);
  }

  async function handleSendNote() {
    if (!noteText.trim()) return;
    await addNote.mutateAsync({ visitId: anchorVisitId, note: noteText });
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
          ? `Sent to the office — ticket #${res.ticketNumber}.`
          : `Sent to the office — ticket #${res.ticketNumber}, but the photo didn't upload.`
      );
      setUpsellOpen(false);
      setUpsellServiceId("");
      setUpsellNote("");
      setUpsellPhoto(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the suggestion");
    }
  }

  async function handleMarkUsed(material: JobProductMaterial, usedQty: number) {
    try {
      await useMaterials.mutateAsync({ visitId: anchorVisitId, jobProductId: material.id, usage: { usedQty } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record materials used");
    }
  }

  async function handleMarkUsedNoInvoice(material: JobProductMaterial, usedQty: number) {
    const confirmed = await confirm({
      title: `${material.productName} will come out of inventory but won't be added to the client's invoice. Continue?`,
      confirmLabel: "Continue",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await useMaterials.mutateAsync({
        visitId: anchorVisitId,
        jobProductId: material.id,
        usage: { usedQty, noInvoice: true },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record materials used");
    }
  }

  async function handleMarkNotUsed(material: JobProductMaterial) {
    const confirmed = await confirm({
      title: `${material.productName} won't be counted as used on this job. Continue?`,
      confirmLabel: "Continue",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await useMaterials.mutateAsync({ visitId: anchorVisitId, jobProductId: material.id, usage: { notUsed: true } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't record materials used");
    }
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadPhoto.mutateAsync({ visitId: anchorVisitId, file });
    if (result?.signedUrl) {
      setPhotoUrls(prev => ({ ...prev, [result.id]: result.signedUrl }));
    }
    e.target.value = "";
  }

  async function loadSignedUrl(storagePath: string, photoId: string) {
    const res = await fetch(`/api/crm/crew/visits/${anchorVisitId}/photos`);
    if (!res.ok) return;
    const all = await res.json();
    const match = all.find((p: { id: string; signedUrl: string }) => p.id === photoId);
    if (match?.signedUrl) {
      setPhotoUrls(prev => ({ ...prev, [photoId]: match.signedUrl }));
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!stop || !anchor) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <p className="text-slate-500">Job not found</p>
        <Button variant="outline" onClick={() => router.push("/crm/crew")}>Back</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 pt-safe-top pb-3 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/crm/crew")} className="p-1 -ml-1 text-slate-500">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 truncate">{stop.clientName ?? "—"}</h1>
            {stop.address && (
              <button onClick={openMaps} className="text-sm text-blue-600 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{stop.address}</span>
              </button>
            )}
          </div>
          {stop.clientPhone && (
            <a href={`tel:${stop.clientPhone}`} className="p-2 text-slate-500">
              <Phone className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>

      <main className="flex-1 px-4 py-4 space-y-4 pb-8">
        {/* Clock status */}
        {isActive && stop.clockedInAt && (
          isPaused && stop.pausedAt ? (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-800 flex items-center gap-1.5">
                  <Coffee className="h-3.5 w-3.5" />
                  On Break
                </p>
                <p className="text-xs text-blue-600">
                  Since {format(parseISO(stop.pausedAt), "h:mm a")}
                </p>
              </div>
              <div className="text-blue-700 font-mono font-bold text-lg">
                <ElapsedTimer start={stop.pausedAt} />
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-amber-800">Job Running</p>
                <p className="text-xs text-amber-600">
                  Started {format(parseISO(stop.clockedInAt), "h:mm a")}
                </p>
              </div>
              <div className="text-amber-700 font-mono font-bold text-lg">
                <ElapsedTimer start={stop.clockedInAt} />
              </div>
            </div>
          )
        )}

        {/* Services checklist — one row per visit in this stop, each its own service */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">
              Services {stop.visits.length > 1 && `(${stop.visits.length})`}
            </h2>
          </div>
          <div className="divide-y divide-slate-100">
            {stop.visits.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400">No services listed</p>
            )}
            {stop.visits.map(v => {
              const svc = visitServices(v)[0];
              const budgeted = svc ? svc.budgetedHours * svc.teamSize : null;
              const rowTerminal = v.status === "completed" || v.status === "cancelled" || v.status === "skipped";
              return (
                <div key={v.id} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{svc?.serviceName ?? "Service"}</p>
                    {budgeted != null && (
                      <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        Budgeted: {budgeted}h
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!hidePricing && svc?.rateCents != null && (
                      <p className="text-sm text-slate-400">{formatCurrency(svc.rateCents)}</p>
                    )}
                    {v.status === "skipped" ? (
                      <span className="text-xs text-orange-600 font-medium">Skipped</span>
                    ) : v.status === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : !rowTerminal ? (
                      <button
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                        onClick={() => setSkipTargetId(v.id)}
                      >
                        <SkipForward className="h-3 w-3" />
                        Skip
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chemical mix — what to use and how much finished-mix solution to
            prepare, computed from the product's application rate + dilution
            ratio when the office has it configured. Only shown when this
            stop actually has chemicals logged. */}
        {usedChemicals.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <FlaskConical className="h-4 w-4" />
                Chemical Mix
              </h2>
            </div>
            <div className="p-3 space-y-2">
              {usedChemicals.map((a) => {
                const visit = stop.visits.find((v) => v.id === a.visitId);
                const serviceName =
                  stop.visits.length > 1 && visit ? visitServices(visit)[0]?.serviceName : undefined;
                return (
                  <div key={a.id} className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                    {serviceName && <p className="text-xs font-medium text-emerald-700 mb-0.5">{serviceName}</p>}
                    <p className="text-sm font-medium text-emerald-900">{a.productName ?? "Chemical"}</p>
                    {a.solutionAmount != null ? (
                      <p className="text-sm text-emerald-800 mt-0.5">
                        Use{" "}
                        <span className="font-semibold">
                          {a.solutionAmount} {a.solutionUnitName ?? ""}
                        </span>{" "}
                        of finished mix
                        {a.chemicalAmount != null && (
                          <span className="text-emerald-600">
                            {" "}
                            ({a.chemicalAmount} {a.unitName ?? ""} active)
                          </span>
                        )}
                      </p>
                    ) : a.chemicalAmount != null ? (
                      <p className="text-sm text-emerald-800 mt-0.5">
                        {a.chemicalAmount} {a.unitName ?? ""}
                      </p>
                    ) : null}
                    {a.applicationRateLabel && (
                      <p className="text-xs text-emerald-600 mt-0.5">{a.applicationRateLabel}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Notes acknowledgment gate */}
        {hasNotes && (
          <div className={`rounded-xl border overflow-hidden ${acknowledged ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="px-4 py-3 flex items-start gap-3">
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${acknowledged ? "text-green-600" : "text-amber-600"}`} />
              <div className="flex-1">
                <p className={`text-sm font-medium ${acknowledged ? "text-green-800" : "text-amber-800"}`}>
                  Job Notes
                </p>
                <p className="text-sm mt-1 text-slate-700 whitespace-pre-wrap">
                  {stop.notesToCrew}
                </p>
              </div>
            </div>
            {!acknowledged && (
              <div className="px-4 pb-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-100"
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
                <p className="text-xs text-amber-700">
                  The office changed these notes after you read them — read them again.
                </p>
              </div>
            )}
            {acknowledged && anchor.acknowledgedNotesAt && (
              <div className="px-4 pb-3">
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" />
                  Acknowledged {format(parseISO(anchor.acknowledgedNotesAt), "h:mm a")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Primary action buttons */}
        {!isComplete && (
          <div className="space-y-2">
            {!isActive ? (
              <Button
                className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700 gap-2"
                onClick={handleClockIn}
                disabled={stopClockIn.isPending || (hasNotes && !acknowledged)}
              >
                {stopClockIn.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                Start Job
              </Button>
            ) : (
              <>
                {isPaused ? (
                  <Button
                    className="w-full h-14 text-base font-bold bg-green-600 hover:bg-green-700 gap-2"
                    onClick={handleResume}
                    disabled={stopResume.isPending}
                  >
                    {stopResume.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                    Resume Job
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-14 text-base font-bold gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={handlePause}
                    disabled={stopPause.isPending}
                  >
                    {stopPause.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Coffee className="h-5 w-5" />}
                    Take a Break
                  </Button>
                )}
                <Button
                  className="w-full h-14 text-base font-bold bg-red-600 hover:bg-red-700 gap-2"
                  onClick={() => setClockOutOpen(true)}
                >
                  <StopIcon className="h-5 w-5" />
                  Stop Job
                </Button>
              </>
            )}
          </div>
        )}

        {isComplete && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
            <p className="font-medium text-green-800">
              {stop.derivedStatus === "skipped" ? "Job Skipped" : "Job Complete"}
            </p>
            {stop.clockedInAt && stop.clockedOutAt && (
              <p className="text-xs text-green-600 mt-1">
                {format(parseISO(stop.clockedInAt), "h:mm a")} – {format(parseISO(stop.clockedOutAt), "h:mm a")}
              </p>
            )}
          </div>
        )}

        {/* Photos */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
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
                disabled={uploadPhoto.isPending}
              />
              <span className="inline-flex items-center gap-1 text-sm text-blue-600 font-medium">
                {uploadPhoto.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Camera className="h-4 w-4" />
                }
                Add Photo
              </span>
            </label>
          </div>
          {photos.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-400 text-center">No photos yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-1 p-2">
              {photos.map(photo => (
                <div key={photo.id} className="aspect-square bg-slate-100 rounded-md overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {photoUrls[photo.id] ? (
                    <img
                      src={photoUrls[photo.id]}
                      alt={photo.caption ?? "Visit photo"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <button
                      className="w-full h-full flex items-center justify-center text-slate-400"
                      onClick={() => loadSignedUrl(photo.storagePath, photo.id)}
                    >
                      <ImageIcon className="h-6 w-6" />
                    </button>
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
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Materials called for
              </h2>
            </div>
            <div className="divide-y divide-slate-100">
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

        {/* Suggest work — hidden unless the office has opened up services for
            crews to suggest, which is how the feature is switched on. */}
        {upsellServices.length > 0 && (
          <button
            onClick={() => setUpsellOpen(true)}
            className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left active:bg-emerald-100"
          >
            <span className="flex items-center gap-2 font-semibold text-emerald-800">
              <Sparkles className="h-4 w-4" />
              Suggest work
            </span>
            <span className="mt-0.5 block text-xs text-emerald-700">
              Spotted something this property needs? Send it to the office.
            </span>
          </button>
        )}

        {/* Notes / Comments */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Notes to Office
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Visible on the dispatch board</p>
          </div>
          {anchor.jobComments && anchor.jobComments.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {typeof anchor.jobComments === "string"
                  ? anchor.jobComments
                  : anchor.jobComments.map((c: { text?: string; content?: string }) => c.text ?? c.content ?? "").join("\n")}
              </p>
            </div>
          )}
          <div className="p-3 flex gap-2">
            <Textarea
              placeholder="Write a note..."
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

      {/* Suggest work — crews never see or set a price here; the office prices
          it from the photo and note. */}
      <Dialog open={upsellOpen} onOpenChange={setUpsellOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suggest work</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">What does it need?</p>
              <div className="flex flex-col gap-1.5">
                {upsellServices.map((svc) => {
                  const picked = upsellServiceId === svc.id;
                  return (
                    <button
                      key={svc.id}
                      onClick={() => setUpsellServiceId(svc.id)}
                      className={`rounded-lg border px-3 py-2.5 text-left ${
                        picked
                          ? "border-emerald-500 bg-emerald-50"
                          : "border-slate-200 active:bg-slate-50"
                      }`}
                    >
                      <span className={`block text-sm font-medium ${picked ? "text-emerald-800" : "text-slate-800"}`}>
                        {svc.name}
                      </span>
                      {svc.upsell_pitch && (
                        <span className="mt-0.5 block text-xs text-slate-500">{svc.upsell_pitch}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                Anything the office should know?
              </p>
              <Textarea
                placeholder="e.g. front beds are thin, client mentioned it too"
                value={upsellNote}
                onChange={(e) => setUpsellNote(e.target.value)}
                className="min-h-[80px] resize-none text-sm"
              />
            </div>

            <div>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 active:bg-slate-50">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setUpsellPhoto(e.target.files?.[0] ?? null)}
                />
                <Camera className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-600">
                  {upsellPhoto ? "Photo attached — tap to replace" : "Add a photo"}
                </span>
              </label>
              <p className="mt-1 text-xs text-slate-400">
                A photo usually saves the office a trip out to quote it.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUpsellOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitUpsell}
              disabled={!upsellServiceId || submitUpsell.isPending}
            >
              {submitUpsell.isPending ? (
                <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending…</>
              ) : (
                "Send to office"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skip dialog — targets one service row at a time */}
      <Dialog open={!!skipTargetId} onOpenChange={(open) => !open && setSkipTargetId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip this service?</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              placeholder="Reason for skipping (required)"
              value={skipReason}
              onChange={e => setSkipReason(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSkipTargetId(null)}>Cancel</Button>
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
            <DialogTitle>Stop Job</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-slate-600">Add any completion notes before finishing.</p>
            <Textarea
              placeholder="Completion notes (optional)"
              value={clockOutNotes}
              onChange={e => setClockOutNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClockOutOpen(false)}>Cancel</Button>
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
