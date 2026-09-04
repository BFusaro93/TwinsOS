"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { MapPin, Clock, Users, ChevronRight, CheckCircle2, XCircle, AlertCircle, Home, UserCircle2 } from "lucide-react";
import { useMyCrewStops, useMyCrewInfo } from "@/lib/hooks/use-crew-app";
import { useCurrentUserStore } from "@/stores";
import { EditCrewDialog } from "@/components/crm/crew/EditCrewDialog";
import { Button } from "@/components/ui/button";
import { visitServiceNames } from "@/lib/utils/visit-stops";
import type { Stop } from "@/lib/utils/visit-stops";
import type { VisitStatus } from "@/types/crm-jobs";

const STATUS_CONFIG: Record<VisitStatus, { label: string; color: string; icon: React.ReactNode }> = {
  scheduled:   { label: "Not Started",  color: "bg-slate-100 text-slate-600",   icon: <Clock className="h-3 w-3" /> },
  dispatched:  { label: "Dispatched",   color: "bg-blue-100 text-blue-700",     icon: <Clock className="h-3 w-3" /> },
  in_progress: { label: "In Progress",  color: "bg-amber-100 text-amber-700",   icon: <AlertCircle className="h-3 w-3" /> },
  completed:   { label: "Complete",     color: "bg-green-100 text-green-700",   icon: <CheckCircle2 className="h-3 w-3" /> },
  cancelled:   { label: "Cancelled",    color: "bg-red-100 text-red-600",       icon: <XCircle className="h-3 w-3" /> },
  skipped:     { label: "Skipped",      color: "bg-orange-100 text-orange-700", icon: <XCircle className="h-3 w-3" /> },
};

function StopCard({ stop, onClick }: { stop: Stop; onClick: () => void }) {
  const cfg = STATUS_CONFIG[stop.derivedStatus];
  const services = stop.visits.flatMap(visitServiceNames).join(", ");
  const startTime = stop.visits.find((v) => v.startTime)?.startTime;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-slate-200 p-4 shadow-sm active:bg-slate-50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-slate-900 truncate">{stop.clientName ?? "—"}</p>
            {stop.visits.length > 1 && (
              <span className="shrink-0 inline-flex items-center rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium px-1.5 py-0.5">
                {stop.visits.length} services
              </span>
            )}
          </div>
          {stop.address && (
            <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="h-3 w-3 shrink-0" />
              {stop.address}
            </p>
          )}
          {services && (
            <p className="text-sm text-slate-600 mt-1 truncate">{services}</p>
          )}
          {startTime && (
            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {startTime}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
            {cfg.icon}
            {cfg.label}
          </span>
          {stop.clockedInAt && !stop.clockedOutAt && (
            <span className="text-xs text-amber-600 font-medium">Running</span>
          )}
          <ChevronRight className="h-4 w-4 text-slate-300 mt-1" />
        </div>
      </div>
      {stop.notesToCrew && (
        <div className="mt-2 pt-2 border-t border-slate-100">
          <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 line-clamp-2">
            📋 {stop.notesToCrew}
          </p>
        </div>
      )}
    </button>
  );
}

export default function CrewSchedulePage() {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: stops = [], isLoading } = useMyCrewStops(today);
  const { data: crewInfo } = useMyCrewInfo();
  const { currentUser, currentUserLoaded } = useCurrentUserStore();
  const [editCrewOpen, setEditCrewOpen] = useState(false);

  const completed = stops.filter(s => s.derivedStatus === "completed").length;
  const total     = stops.length;

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 pt-safe-top pb-3 sticky top-0 z-10">
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
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-brand-50 px-3 py-1.5 text-right">
              <UserCircle2 className="h-5 w-5 shrink-0 text-brand-600" />
              <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wide text-brand-600/70">Signed in as</p>
                <p className="break-words text-sm font-bold text-brand-800">{currentUser.name}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide font-medium">
              {format(new Date(), "EEEE, MMMM d")}
            </p>
            <h1 className="text-lg font-bold text-slate-900">
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
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>{completed} of {total} complete</span>
              <span>{Math.round((completed / total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${(completed / total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Stop list */}
      <main className="flex-1 px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-white rounded-xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && stops.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="h-12 w-12 text-slate-300 mb-3" />
            <p className="font-medium text-slate-600">No jobs scheduled today</p>
            <p className="text-sm text-slate-400 mt-1">Check back later or contact the office.</p>
          </div>
        )}

        {stops.map((stop, idx) => (
          <div key={stop.key} className="flex gap-3">
            <div className="flex flex-col items-center pt-5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                stop.derivedStatus === "completed" ? "bg-green-500 text-white" :
                stop.derivedStatus === "in_progress" ? "bg-amber-500 text-white" :
                stop.derivedStatus === "skipped" ? "bg-slate-300 text-slate-600" :
                "bg-slate-200 text-slate-600"
              }`}>
                {idx + 1}
              </div>
              {idx < stops.length - 1 && (
                <div className="w-px flex-1 bg-slate-200 mt-1" />
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
          <div className="mt-4 p-3 bg-white rounded-xl border border-slate-200 flex justify-around text-center">
            <div>
              <p className="text-xl font-bold text-slate-900">{total}</p>
              <p className="text-xs text-slate-500">Total</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-600">{completed}</p>
              <p className="text-xs text-slate-500">Done</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600">
                {stops.filter(s => s.derivedStatus === "in_progress").length}
              </p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-400">
                {stops.filter(s => s.derivedStatus === "scheduled" || s.derivedStatus === "dispatched").length}
              </p>
              <p className="text-xs text-slate-500">Remaining</p>
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
