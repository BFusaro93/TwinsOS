"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO, differenceInMinutes } from "date-fns";
import {
  ArrowLeft, MapPin, Phone, Clock, Camera, MessageSquare,
  CheckSquare, Square, AlertTriangle, Play, Square as StopIcon, SkipForward,
  Image as ImageIcon, Send, Loader2,
} from "lucide-react";
import {
  useVisitDetail,
  useVisitPhotos,
  useClockIn,
  useClockOut,
  useSkipVisit,
  useAcknowledgeNotes,
  useAddCrewNote,
  useUploadVisitPhoto,
} from "@/lib/hooks/use-crew-app";
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

export default function CrewJobDetailPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = use(params);
  const router = useRouter();
  const { data: visit, isLoading } = useVisitDetail(visitId);
  const { data: photos = [] } = useVisitPhotos(visitId);

  const clockIn       = useClockIn();
  const clockOut      = useClockOut();
  const skipVisit     = useSkipVisit();
  const acknowledge   = useAcknowledgeNotes();
  const addNote       = useAddCrewNote();
  const uploadPhoto   = useUploadVisitPhoto();

  const [noteText, setNoteText]       = useState("");
  const [skipReason, setSkipReason]   = useState("");
  const [clockOutNotes, setClockOutNotes] = useState("");
  const [skipOpen, setSkipOpen]       = useState(false);
  const [clockOutOpen, setClockOutOpen] = useState(false);
  const [photoUrls, setPhotoUrls]     = useState<Record<string, string>>({});

  const job     = visit?.job;
  const hasNotes = !!(visit?.notesToCrew || job?.notesToCrew || job?.notes);
  const acknowledged = !!visit?.acknowledgedNotesAt;
  const isActive = visit?.status === "in_progress";
  const isComplete = visit?.status === "completed" || visit?.status === "skipped";

  const addr = [job?.serviceAddress, job?.serviceCity, job?.serviceState]
    .filter(Boolean).join(", ");

  function openMaps() {
    if (!addr) return;
    window.open(`https://maps.apple.com/?q=${encodeURIComponent(addr)}`, "_blank");
  }

  async function handleClockIn() {
    await clockIn.mutateAsync(visitId);
  }

  async function handleClockOut() {
    await clockOut.mutateAsync({ visitId, notes: clockOutNotes || undefined });
    setClockOutOpen(false);
    router.push("/crm/crew");
  }

  async function handleSkip() {
    if (!skipReason.trim()) return;
    await skipVisit.mutateAsync({ visitId, reason: skipReason });
    setSkipOpen(false);
    router.push("/crm/crew");
  }

  async function handleAcknowledge() {
    await acknowledge.mutateAsync(visitId);
  }

  async function handleSendNote() {
    if (!noteText.trim()) return;
    await addNote.mutateAsync({ visitId, note: noteText });
    setNoteText("");
  }

  async function handlePhotoCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadPhoto.mutateAsync({ visitId, file });
    if (result?.signed_url) {
      setPhotoUrls(prev => ({ ...prev, [result.id]: result.signed_url }));
    }
    e.target.value = "";
  }

  async function loadSignedUrl(storagePath: string, photoId: string) {
    const res = await fetch(`/api/crm/crew/visits/${visitId}/photos`);
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

  if (!visit) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-3">
        <p className="text-slate-500">Visit not found</p>
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
            <h1 className="font-bold text-slate-900 truncate">{visit.clientName ?? "—"}</h1>
            {addr && (
              <button onClick={openMaps} className="text-sm text-blue-600 flex items-center gap-1 mt-0.5">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{addr}</span>
              </button>
            )}
          </div>
          {visit.clientPhone && (
            <a href={`tel:${visit.clientPhone}`} className="p-2 text-slate-500">
              <Phone className="h-5 w-5" />
            </a>
          )}
        </div>
      </div>

      <main className="flex-1 px-4 py-4 space-y-4 pb-8">
        {/* Clock status */}
        {isActive && visit.clockedInAt && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-800">Job Running</p>
              <p className="text-xs text-amber-600">
                Started {format(parseISO(visit.clockedInAt), "h:mm a")}
              </p>
            </div>
            <div className="text-amber-700 font-mono font-bold text-lg">
              <ElapsedTimer start={visit.clockedInAt} />
            </div>
          </div>
        )}

        {/* Services */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Services</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {(job?.services ?? []).length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-400">No services listed</p>
            )}
            {(job?.services ?? []).map(svc => (
              <div key={svc.id} className="px-4 py-3 flex justify-between items-center">
                <p className="text-sm text-slate-700">{svc.serviceName}</p>
                {svc.rateCents != null && (
                  <p className="text-sm text-slate-400">{formatCurrency(svc.rateCents)}</p>
                )}
              </div>
            ))}
          </div>
          {job?.budgetedHours != null && (
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
              <Clock className="h-3 w-3" />
              Budgeted: {job.budgetedHours}h
            </div>
          )}
        </div>

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
                  {visit.notesToCrew || job?.notesToCrew || job?.notes}
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
                    : acknowledged ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />
                  }
                  I&apos;ve read the notes
                </Button>
              </div>
            )}
            {acknowledged && (
              <div className="px-4 pb-3">
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" />
                  Acknowledged {format(parseISO(visit.acknowledgedNotesAt!), "h:mm a")}
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
                disabled={clockIn.isPending || (hasNotes && !acknowledged)}
              >
                {clockIn.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                Start Job
              </Button>
            ) : (
              <Button
                className="w-full h-14 text-base font-bold bg-red-600 hover:bg-red-700 gap-2"
                onClick={() => setClockOutOpen(true)}
              >
                <StopIcon className="h-5 w-5" />
                Stop Job
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full gap-2 text-slate-600"
              onClick={() => setSkipOpen(true)}
            >
              <SkipForward className="h-4 w-4" />
              Skip Job
            </Button>
          </div>
        )}

        {isComplete && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center">
            <p className="font-medium text-green-800">
              {visit.status === "skipped" ? "Job Skipped" : "Job Complete"}
            </p>
            {visit.clockedInAt && visit.clockedOutAt && (
              <p className="text-xs text-green-600 mt-1">
                {format(parseISO(visit.clockedInAt), "h:mm a")} – {format(parseISO(visit.clockedOutAt), "h:mm a")}
                {" "}({visit.actualHours != null ? `${visit.actualHours}h` : ""})
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

        {/* Notes / Comments */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Notes to Office
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Visible on the dispatch board</p>
          </div>
          {visit.jobComments && visit.jobComments.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="text-sm text-slate-600 whitespace-pre-wrap">
                {typeof visit.jobComments === "string"
                  ? visit.jobComments
                  : visit.jobComments.map((c: { text?: string; content?: string }) => c.text ?? c.content ?? "").join("\n")}
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

      {/* Skip dialog */}
      <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Skip this job?</DialogTitle>
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
            <Button variant="outline" onClick={() => setSkipOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleSkip}
              disabled={!skipReason.trim() || skipVisit.isPending}
            >
              {skipVisit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Skip Job"}
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
              disabled={clockOut.isPending}
            >
              {clockOut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Complete Job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
