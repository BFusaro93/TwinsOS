"use client";

import { notesToPlainText } from "@/lib/utils/rich-notes";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { Truck, MapPin, Clock, Users, Sun, Moon, ChevronRight, CheckCircle2, XCircle, AlertCircle, Home, BookOpen, UserCircle2, Navigation, Car, Loader2 } from "lucide-react";
import { useMyCrewStops, useStopPartnerCrews, useMyCrewInfo, useCrewDriveToday, useStartDrive, useEndDrive, useCrewDay, useCrewDayAction, useCrewTap, useCrewEquipment } from "@/lib/hooks/use-crew-app";
import { useCurrentUserStore } from "@/stores";
import { useOrgDates } from "@/lib/hooks/use-org-timezone";
import { EditCrewDialog } from "@/components/crm/crew/EditCrewDialog";
import { Button } from "@/components/ui/button";
import { visitServiceNames } from "@/lib/utils/visit-stops";
import { formatTimeOfDay } from "@/lib/utils";
import { openInMaps } from "@/lib/utils/maps";
import type { Stop } from "@/lib/utils/visit-stops";
import type { VisitStatus } from "@/types/crm-jobs";
import { t, CrewLanguageToggle, crewDateLocale } from "@/lib/crew-i18n";

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

function StopCard({ stop, partners, onClick, today }: { stop: Stop; partners: string[]; onClick: () => void; today: string }) {
  const cfg = STATUS_CONFIG[stop.derivedStatus];
  const services = stop.visits.flatMap(visitServiceNames).join(", ");
  const startTime = stop.visits.find((v) => v.startTime)?.startTime;
  // Kept on the list after midnight (unfinished storm/late route, or still clocked in).
  const fromEarlierDay = stop.visits.some((v) => v.scheduledDate < today);

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
            {fromEarlierDay && (
              <span className="shrink-0 inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 text-[10px] font-medium px-1.5 py-0.5">
                {t("From yesterday")}
              </span>
            )}
          </div>
          {partners.length > 0 && (
            <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5">
              With {partners.join(", ")}
            </p>
          )}
          {stop.address && (
            // Plain text, not a link: the address sits where people tap to open the job, and a
            // link here sent crews to their maps app instead. The map button is on the right.
            <p className="text-sm text-slate-600 dark:text-neutral-400 flex max-w-full min-w-0 items-center gap-1 mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{stop.address}</span>
            </p>
          )}
          {stop.gateCode && (
            <p className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-neutral-300">Gate code: <span className="font-mono">{stop.gateCode}</span></p>
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
              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">{t("On Break")}</span>
            ) : (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">{t("Running")}</span>
            )
          )}
          {stop.address && (
            <button
              type="button"
              aria-label={t("Open in maps")}
              onClick={(e) => { e.stopPropagation(); openInMaps(stop.fullAddress || stop.address); }}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-blue-600 dark:text-blue-400 active:bg-muted"
            >
              <MapPin className="h-4 w-4" />
            </button>
          )}
          <ChevronRight className="h-4 w-4 text-slate-300 dark:text-neutral-500" />
        </div>
      </div>
      {stop.notesToCrew && (
        <div className="mt-2 pt-2 border-t border-slate-100 dark:border-neutral-800">
          <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded px-2 py-1 line-clamp-2">
            📋 {notesToPlainText(stop.notesToCrew)}
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
  const { today: orgToday, format: orgFormat } = useOrgDates();
  const today = orgToday();
  // Times read on the org's wall clock, not the phone's.
  const clock = (iso: string) => orgFormat(iso, { hour: "numeric", minute: "2-digit" });
  const tap = useCrewTap();
  const { data: stops = [], isLoading, isError: stopsError, error: stopsErr, refetch: refetchStops } = useMyCrewStops(today, true);
  const { data: partnerCrews } = useStopPartnerCrews(stops.flatMap((s) => s.visits));
  const { data: crewInfo } = useMyCrewInfo();
  const { data: drive } = useCrewDriveToday(today);
  const { data: equipment = [] } = useCrewEquipment(today);
  const startDrive = useStartDrive();
  const endDrive = useEndDrive();
  const { data: crewDay, isSuccess: crewDayLoaded } = useCrewDay();
  const dayAction = useCrewDayAction();
  const { currentUser, currentUserLoaded } = useCurrentUserStore();
  const [editCrewOpen, setEditCrewOpen] = useState(false);

  const completed = stops.filter(s => s.derivedStatus === "completed").length;
  // Skipped and cancelled stops are finished too: counting them as open meant a finished day
  // read "7 of 8 complete · 88%" forever.
  const resolved  = stops.filter(s => s.derivedStatus === "completed" || s.derivedStatus === "skipped" || s.derivedStatus === "cancelled").length;
  const total     = stops.length;
  const allDone   = total > 0 && resolved === total;
  const anyJobActive = stops.some(s => s.derivedStatus === "in_progress");
  // The paid day, shop to shop: started once the leader taps Start Day, ended
  // when no one is still on the clock after End Day.
  const dayMembers = crewDay?.members ?? [];
  const dayStarts = dayMembers.map(m => m.startedAt).filter((t): t is string => !!t).sort();
  const dayStartedAt = dayStarts[0] ?? null;
  const dayOpen = dayMembers.some(m => m.startedAt && !m.endedAt);
  const dayEnded = !!dayStartedAt && !dayOpen;
  // A shift carried over from the previous date (storm work past midnight):
  // say so, so the leader doesn't take it for a shift started this morning.
  const dayFromYesterday = !!crewDay?.workDate && dayMembers.some(
    (m) => m.startedAt && !m.endedAt && !!m.shiftWorkDate && m.shiftWorkDate < crewDay.workDate
  );

  return (
    <div className="flex flex-col min-h-dvh">
      {/* Header */}
      <div className="bg-card border-b border-border px-4 pt-[env(safe-area-inset-top)] pb-3 sticky top-0 z-10">
        {/* Top row: way back to the crew home page + which crew login this
            tablet is signed in as (shared crew accounts — easy to grab the
            wrong tablet, so make it obvious). */}
        <div className="flex items-center justify-between gap-3 py-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/home">
                <Home className="h-4 w-4" />
                {t("Home")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <Link href="/crm/crew/reference">
                <BookOpen className="h-4 w-4" />
                {t("Reference")}
              </Link>
            </Button>
            <CrewLanguageToggle />
          </div>
          {currentUserLoaded && (
            <div className="flex min-w-0 items-center gap-2 rounded-lg bg-brand-50 dark:bg-brand-900/30 px-3 py-1.5 text-right">
              <UserCircle2 className="h-5 w-5 shrink-0 text-brand-600 dark:text-brand-400" />
              <div className="min-w-0 leading-tight">
                <p className="text-[10px] font-medium uppercase tracking-wide text-brand-600/70 dark:text-brand-400/70">{t("Signed in as")}</p>
                <p className="break-words text-sm font-bold text-brand-800 dark:text-brand-300">{currentUser.name}</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-1">
          <div>
            <p className="text-xs text-slate-400 dark:text-neutral-500 uppercase tracking-wide font-medium">
              {format(parseISO(today), "EEEE, MMMM d", { locale: crewDateLocale() })}
            </p>
            <h1 className="text-lg font-bold text-slate-900 dark:text-neutral-100">
              {crewInfo?.crewName ?? t("My Schedule")}
            </h1>
          </div>
          {/* The dialog only exists for a linked crew; the button did nothing otherwise. */}
          {crewInfo && (
            <Button
              variant="outline"
              className="gap-1.5 min-h-11"
              onClick={() => setEditCrewOpen(true)}
            >
              <Users className="h-4 w-4" />
              {t("Edit Crew")}
            </Button>
          )}
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>{t("{done} of {total} done", { done: resolved, total })}{resolved > completed ? ` ${t("({n} skipped)", { n: resolved - completed })}` : ""}</span>
              <span>{Math.round((resolved / total) * 100)}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${(resolved / total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* The paid day — clock the whole crew in at the shop and out at the
          shop. Individual exceptions (late, out, left early) are in Edit Crew. */}
      <div className="px-4 pt-4">
        {!dayStartedAt ? (
          <>
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white h-12 text-base"
              onClick={() => dayAction.mutate({ action: "start_day" })}
              disabled={dayAction.isPending || !crewDayLoaded || dayMembers.length === 0}
            >
              {dayAction.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sun className="h-5 w-5" />}
              {t("Start Day")}
            </Button>
            {/* Only once the roster has actually loaded — it flashed on every load before. */}
            {crewDayLoaded && dayMembers.length === 0 && (
              <p className="mt-2 text-center text-xs text-amber-700 dark:text-amber-400">
                {t("No one is on your crew today. Tap Edit Crew to add the people working, or ask the office to add them under Team → Crews.")}
              </p>
            )}
          </>
        ) : dayOpen ? (
          <div className="bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-green-800 dark:text-green-300">{dayFromYesterday ? t("Day started yesterday {time}", { time: clock(dayStartedAt) }) : t("Day started {time}", { time: clock(dayStartedAt) })}</p>
              <p className="text-xs text-green-700 dark:text-green-400">
                {dayMembers.filter(m => m.startedAt && !m.endedAt).length} on the clock
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-red-300 dark:border-red-800 text-red-600 dark:text-red-400"
              onClick={() => {
                if (anyJobActive && !window.confirm(t("A job is still in progress. End the day anyway?"))) return;
                dayAction.mutate({ action: "end_day" });
              }}
              disabled={dayAction.isPending}
            >
              {dayAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Moon className="h-4 w-4" />}
              {t("End Day")}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-center text-slate-400 dark:text-neutral-500">
            {dayEnded && t("Day ended — everyone is clocked out.")}
          </p>
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
                {t("Driving")}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Since {clock(drive.openSegment.startedAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-blue-700 dark:text-blue-400 font-mono font-bold text-lg">
                <DriveElapsed start={drive.openSegment.startedAt} />
              </span>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 gap-1.5"
                onClick={() => endDrive.mutate(tap())}
                disabled={endDrive.isPending}
              >
                {endDrive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                {t("Arrived")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              onClick={() => startDrive.mutate(tap())}
              disabled={startDrive.isPending || anyJobActive}
            >
              {startDrive.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Car className="h-4 w-4" />}
              {t("Start Drive")}
            </Button>
            {/* A title tooltip never shows on a phone — say it. */}
            {anyJobActive ? (
              <p className="text-xs text-slate-500 dark:text-neutral-400 text-right">{t("Stop the active job to start drive time")}</p>
            ) : !!drive?.totalMinutes && (
              <p className="text-xs text-slate-400 dark:text-neutral-500">{t("Drive today: {m}m", { m: drive.totalMinutes })}</p>
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

        {!isLoading && stopsError && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-10 w-10 text-amber-500 mb-3" />
            {/not authenticated|jwt|session|401/i.test(stopsErr instanceof Error ? stopsErr.message : String(stopsErr ?? "")) ? (
              <>
                <p className="font-medium text-slate-700 dark:text-neutral-300">{t("You're signed out")}</p>
                <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">{t("Sign in again to see today's jobs.")}</p>
                <Button className="mt-4 min-h-11" asChild><Link href="/login">{t("Sign in")}</Link></Button>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-700 dark:text-neutral-300">{t("Couldn't load today's jobs")}</p>
                <p className="text-sm text-slate-500 dark:text-neutral-400 mt-1">{t("Check your signal, then try again. Your jobs are still scheduled.")}</p>
                <Button variant="outline" className="mt-4 min-h-11" onClick={() => void refetchStops()}>{t("Try again")}</Button>
              </>
            )}
          </div>
        )}

        {allDone && (
          <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/40 px-4 py-3 text-center">
            <p className="font-medium text-green-800 dark:text-green-300">{t("All stops done for today")}</p>
            {dayOpen && <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">{t("Tap End Day when the crew is back at the shop.")}</p>}
          </div>
        )}

        {!isLoading && !stopsError && stops.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CheckCircle2 className="h-12 w-12 text-slate-300 dark:text-neutral-500 mb-3" />
            {crewInfo === null ? (
              <>
                <p className="font-medium text-slate-600 dark:text-neutral-400">{t("Your login isn't linked to a crew")}</p>
                <p className="text-sm text-slate-400 dark:text-neutral-500 mt-1">
                  {t("Jobs can't show up here until the office links this login to a crew (Team → Crews → Linked Login).")}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-slate-600 dark:text-neutral-400">{t("No jobs scheduled today")}</p>
                <p className="text-sm text-slate-400 dark:text-neutral-500 mt-1">{t("Check back later or contact the office.")}</p>
              </>
            )}
          </div>
        )}

        {equipment.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-neutral-400">
              <Truck className="h-3.5 w-3.5" /> {t("Equipment today")}
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {equipment.map((e) => (
                <li key={`${e.kind}:${e.id}`} className="text-sm text-slate-800 dark:text-neutral-200">
                  {e.name}
                  {e.tag && <span className="ml-1.5 text-xs text-slate-500 dark:text-neutral-400">{e.tag}</span>}
                </li>
              ))}
            </ul>
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
                today={today}
                partners={[...new Set(stop.visits.flatMap((v) => partnerCrews?.get(v.id) ?? []))]}
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
              <p className="text-xs text-muted-foreground">{t("Total")}</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{completed}</p>
              <p className="text-xs text-muted-foreground">{t("Done")}</p>
            </div>
            <div>
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {stops.filter(s => s.derivedStatus === "in_progress").length}
              </p>
              <p className="text-xs text-muted-foreground">{t("Active")}</p>
            </div>
            <div>
              <p className="text-xl font-bold text-slate-400 dark:text-neutral-500">
                {stops.filter(s => s.derivedStatus === "scheduled" || s.derivedStatus === "dispatched").length}
              </p>
              <p className="text-xs text-muted-foreground">{t("Remaining")}</p>
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
