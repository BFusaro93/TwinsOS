"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { MapPin, Clock, Users, ChevronRight, CheckCircle2, XCircle, AlertCircle, Home, UserCircle2, Navigation, Car, Loader2 } from "lucide-react";
import { useMyCrewStops, useMyCrewInfo, useCrewDriveToday, useStartDrive, useEndDrive } from "@/lib/hooks/use-crew-app";
import { useCurrentUserStore } from "@/stores";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { EditCrewDialog } from "@/components/crm/crew/EditCrewDialog";
import { Button } from "@/components/ui/button";
import { visitServiceNames } from "@/lib/utils/visit-stops";
import { formatTimeOfDay } from "@/lib/utils";
import { openInMaps } from "@/lib/utils/maps";
import type { Stop } from "@/lib/utils/visit-stops";
import type { VisitStatus } from "@/types/crm-jobs";

function DriveElapsed({ start }: { start: string }) {
  const [, forceUpdate] = useState(0);
  // useEffect, not a useState initializer: an initializer's returned cleanup
  // is stored as state and never runs, so the interval leaked on unmount.
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const mins = Math.max(0, differenceInMinutes(new Date(), parseISO(start)));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <span>{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>;
}

const STATUS_CONFIG: Record<VisitStatus, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled:   { label: "Not Started",  color: "bg-muted text-slate-600 dark:text-neutral-400",   icon: <Clock className="h-3 w-3" /> },
  dispatched:  { label: "Dispatched",   color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400",     icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: "In Progress",  color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",   icon: <AlertCircle className="h-3 w-3" /> },
  completed:   { label: "Complete",     color: "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400",   icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled:   { label: "Cancelled",    color: "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400",       icon: <XCircle className="h-3 w-3" /> },
  skipped:     { label: "Skipped",      color: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400", icon: <XCircle className="h-3 w-3" /> },
};

function StopCard({ stop, onClick }: { stop: Stop; onClick: () => void }) {
  const cfg = STATUS_CONFIG[stop.derivedStatus];
  const services = stop.visits.flatMap(visitServiceNames).join(", ");
  const startTime = stop.visits.find((v) => v.startTime)?.startTime;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="w-full text-left bg-card rounded-xl border border-border p-4 shadow-sm active:bg-slate-50 dark:active:bg-muted/40 transition-colors cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-slate-900 dark:text-neutral-100 truncate">{stop.clientName ?? "—"}</p>
            {stop.visits.length > 1 && (
              <span className="shrink-0 inline-flex items-center rounded-full bg-muted text-muted-foreground text-[10px] font-medium px-1.5 py-0.5">
                {stop.visits.length} services
              </span>
            )}
          </div>
          {stop.address && (
            <button
              onClick={(e) => { e.stopPropagation(); openInMaps(stop.address); }}
              className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-0.5 truncate"
            >
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{stop.address}</span>
            </button>
          )}
          {services && (
            <p className="text-sm text-slate-600 dark:text-neutral-400 mt-1 truncate">{services}</p>
          )}
          {startTime && (
            <p className="text-xs text-slate-400 dark:text-neutral-500 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatTimeOfDay(startTime)}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
          </span>
          {stop.clockedInAt && !stop.clockedOutAt && (
            stop.pausedAt ? (
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">On Break</span>
            ) : (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">Running</span>
            )
          )}
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-neutral-600 mt-1" />
        </div>
      </div>
      {stop.notesToCrew && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-1 line-clamp-2">
            📋 {stop.notesToCrew}
          </p>
        </div>
      )}
    </div>
  );
}

export default function CrewSchedulePage() {
  const router = useRouter();
  // The ORG's calendar day, not the tablet's — the same day /api/crm/crew/visits
  // and the dispatch board use. A device clock in another zone (or just past
  // midnight UTC-wise) used to open on a different day's route.
  const { today: orgToday } = useOrgDates();
  const today = orgToday();
  const { data: stops = [], isLoading } = useMyCrewStops(today, true);
  const { data: crewInfo } = useMyCrewInfo();
  const { data: drive } = useCrewDriveToday(today);
  const startDrive = useStartDrive();
  const endDrive = useEndDrive();
  const { currentUser, currentUserLoaded } = useCurrentUserStore();
  const [editCrewOpen, setEditCrewOpen] = useState(false);

  const completed = stops.filter(s => s.derivedStatus === "completed").length;
  const total     = stops.length;
  const anyJobActive = stops.some(s => s.derivedStatus === "in_progress");

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-safe-top pb-3 sticky top-0 z-10">
        {/* Top row: way back to the crew home page + which crew login this
            tablet is signed in as (shared crew accounts — easy to grab the
            wrong tablet, so make it obvious). */}
        <div className="flex items-center justify-between gap-3 py-2">
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/home">
              <Home className="h-4 w-4" />
              Home
            </Link>
          </Button>
          {currentUserLoaded && (
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-brand-50 dark:bg-brand-900/30 px-3 py-1.5 text-right">
              <UserCircle2 className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
              <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wide text-brand-600/70 dark:text-brand-400/70">Signed in as</p>
                <p className="break-words text-sm font-bold text-brand-800 dark:text-brand-300">{currentUser.name}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          <div>
            <p className="text-xs text-slate-400 dark:text-neutral-500 uppercase tracking-wide font-medium">
              {format(parseISO(today), "EEEE, MMMM d")}
            </p>
            <h1 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
              {crewInfo?.crewName ?? "My Schedule"}
            </h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setEditCrewOpen(true)}
          >
            <Users className="h-4 w-4" />
            Edit Crew
          </Button>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{completed} of {total} complete</span>
              <span>{Math.round((completed / total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Drive time — day-level, not tied to any one stop (yard to first
          stop, between stops, last stop back to yard). */}
      <div className="px-4 pt-4">
        {drive?.openSegment ? (
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                <Car className="h-3.5 w-3.5" />
                Driving
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Since {format(parseISO(drive.openSegment.startedAt), "h:mm a")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-700 dark:text-blue-400 font-mono font-bold text-lg">
                <DriveElapsed start={drive.openSegment.startedAt} />
              </span>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                onClick={() => endDrive.mutate()}
                disabled={endDrive.isPending}
              >
                {endDrive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                Arrived
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              onClick={() => startDrive.mutate()}
              disabled={startDrive.isPending || anyJobActive}
              title={anyJobActive ? "Stop the active job before starting drive time" : undefined}
            >
              {startDrive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
              Start Drive
            </Button>
            {!!drive?.totalMinutes && (
              <p className="text-xs text-slate-400 dark:text-neutral-500">Drive today: {drive.totalMinutes}m</p>
            )}
          </div>
        )}
      </div>

      {/* Stop list */}
      <main className="flex-1 px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-card rounded-xl border border-border animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && stops.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="h-12 w-12 text-slate-300 dark:text-neutral-600 mb-3" />
            <p className="font-medium text-slate-600 dark:text-neutral-400">No jobs scheduled today</p>
            <p className="text-sm text-slate-400 dark:text-neutral-500 mt-1">Check back later or contact the office.</p>
          </div>
        )}

        {stops.map((stop, idx) => (
          <div key={stop.key} className="flex gap-3">
            <div className="flex flex-col items-center pt-5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                stop.derivedStatus === "completed" ? "bg-green-500 text-white" :
                stop.derivedStatus === "in_progress" ? "bg-amber-500 text-white" :
                stop.derivedStatus === "skipped" ? "bg-slate-300 dark:bg-neutral-600 text-slate-600 dark:text-neutral-400" :
                "bg-slate-200 dark:bg-neutral-700 text-slate-600 dark:text-neutral-400"
              }`}>
                {idx + 1}
              </div>
              {idx < stops.length - 1 && (
                <div className="w-px flex-1 bg-slate-200 dark:bg-neutral-700 mt-1" />
              )}
            </div>
            <div className="flex-1 pb-1">
              <StopCard
                stop={stop}
                onClick={() => router.push(`/crm/crew/stops/${stop.anchorVisitId}`)}
              />
            </div>
          </div>
        ))}

        {/* Bottom summary */}
        {total > 0 && (
          <div className="mt-4 p-3 bg-card rounded-xl border border-border flex justify-around text-center">
            <div>
              <p className="text-xl font-bold text-slate-900 dark:text-neutral-100">{total}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{completed}</p>
              <p className="text-xs text-muted-foreground">Done</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {stops.filter(s => s.derivedStatus === "in_progress").length}
              </p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-400 dark:text-neutral-500">
                {stops.filter(s => s.derivedStatus === "scheduled" || s.derivedStatus === "dispatched").length}
              </p>
              <p className="text-xs text-muted-foreground">Remaining</p>
            </div>
          </div>
        )}
      </main>

      {crewInfo && (
        <EditCrewDialog
          open={editCrewOpen}
          onOpenChange={setEditCrewOpen}
          crewInfo={crewInfo}
          visitId={stops.find(s => s.derivedStatus === "in_progress")?.anchorVisitId}
        />
      )}
    </div>
  );
}
