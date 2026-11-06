"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCrewMemberTimes, useUpsertCrewMemberTime } from "@/lib/hooks/use-crew-app";
import { useOrgTimeZone } from "@/lib/hooks/use-org-timezone";
import { instantToZoneWallClock, zoneWallClockToInstant } from "@/lib/time/zone";
import { memberVisitPauseMinutes } from "@/lib/crew/visit-pause";

interface RowDraft {
  crewMemberId: string;
  name: string;
  /** The punch's own org-calendar date, so a shift that crosses midnight keeps its out date. */
  inDate: string;
  outDate: string;
  inTime: string;
  outTime: string;
  originalIn: string;
  originalOut: string;
  /** This person's own break + lunch minutes, taken off their time like the saved hours do. */
  deductMinutes: number;
}

function minutesBetween(inDate: string, inTime: string, outDate: string, outTime: string, tz: string): number | null {
  const a = zoneWallClockToInstant(inDate, inTime, tz);
  const b = zoneWallClockToInstant(outDate, outTime, tz);
  if (!a || !b || b <= a) return null;
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

function fmtMinutes(m: number | null): string {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/**
 * Shown after a crew finishes a stop: what each person is on the clock for, with
 * the start and finish adjustable before the crew leaves the screen (SA's "Time
 * Summary"). Edits go through the same member-times route as Edit Crew, which
 * keeps its own guards (crew must own the visit; locked once the invoice has been sent — a draft invoice still allows edits).
 */
export function TimeSummaryDialog({
  open,
  visitId,
  visitBreakMinutes = 0,
  visitClockedInAt = null,
  visitClockedOutAt = null,
  onClose,
}: {
  open: boolean;
  visitId: string;
  /** The stop's pause time — taken off every person's time (sumPunchManHours). */
  visitBreakMinutes?: number;
  /** The stop's own clock window — a person's share of the pause is capped at their overlap with it. */
  visitClockedInAt?: string | null;
  visitClockedOutAt?: string | null;
  onClose: () => void;
}) {
  const tz = useOrgTimeZone();
  const { data: times = [], isLoading } = useCrewMemberTimes(visitId);
  const upsert = useUpsertCrewMemberTime();
  const [drafts, setDrafts] = useState<RowDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rebuild the editable rows when the punches load (only closed punches can be reviewed).
  useEffect(() => {
    if (!open) return;
    setDrafts(
      times
        .filter((t) => t.clockedInAt && t.clockedOutAt)
        .map((t) => {
          const i = instantToZoneWallClock(new Date(t.clockedInAt!), tz);
          const o = instantToZoneWallClock(new Date(t.clockedOutAt!), tz);
          return {
            crewMemberId: t.crewMemberId,
            name: t.memberName ?? "Crew member",
            inDate: i.date,
            outDate: o.date,
            inTime: i.time,
            outTime: o.time,
            originalIn: i.time,
            originalOut: o.time,
            deductMinutes: Math.max(0, (t.breakMinutes ?? 0) + (t.lunchMinutes ?? 0)),
          };
        })
    );
  }, [open, times, tz]);

  // Net of breaks, lunch and the stop's pause — the same figure Job Costing and the
  // Timesheet report save (sumPunchManHours), so crew don't "fix" times to match it.
  // Each person's share of the stop's pause is capped at the time they overlapped
  // the stop (memberVisitPauseMinutes — the rule payroll and Job Costing use).
  const pauseFor = (d: RowDraft): number => {
    const a = zoneWallClockToInstant(d.inDate, d.inTime, tz);
    const b = zoneWallClockToInstant(d.outDate, d.outTime, tz);
    if (!a || !b) return 0;
    return Math.round(memberVisitPauseMinutes({
      pauseMinutes: visitBreakMinutes,
      punchIn: a.toISOString(),
      punchOut: b.toISOString(),
      visitIn: visitClockedInAt,
      visitOut: visitClockedOutAt,
    }));
  };
  const netMinutes = (d: RowDraft): number | null => {
    const span = minutesBetween(d.inDate, d.inTime, d.outDate, d.outTime, tz);
    return span == null ? null : Math.max(0, span - d.deductMinutes - pauseFor(d));
  };
  const totalMinutes = drafts.reduce((sum, d) => sum + (netMinutes(d) ?? 0), 0);
  const invalid = drafts.some((d) => minutesBetween(d.inDate, d.inTime, d.outDate, d.outTime, tz) == null);

  function patch(idx: number, change: Partial<RowDraft>) {
    setDrafts((cur) => cur.map((d, i) => (i === idx ? { ...d, ...change } : d)));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      for (const d of drafts) {
        if (d.inTime === d.originalIn && d.outTime === d.originalOut) continue;
        const clockedInAt = zoneWallClockToInstant(d.inDate, d.inTime, tz);
        const clockedOutAt = zoneWallClockToInstant(d.outDate, d.outTime, tz);
        if (!clockedInAt || !clockedOutAt) continue;
        await upsert.mutateAsync({
          visitId,
          crewMemberId: d.crewMemberId,
          clockedInAt: clockedInAt.toISOString(),
          clockedOutAt: clockedOutAt.toISOString(),
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the times");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Time summary</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No individual times were recorded for this job.</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Check each person&apos;s start and finish. Change one if someone arrived late or left early.
            </p>
            {drafts.map((d, idx) => {
              const mins = netMinutes(d);
              const offMinutes = d.deductMinutes + pauseFor(d);
              return (
                <div key={d.crewMemberId} className="rounded-lg bg-slate-50 dark:bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-800 dark:text-neutral-100">{d.name}</p>
                    <p className={`text-sm font-semibold ${mins == null ? "text-red-600" : ""}`}>{fmtMinutes(mins)}</p>
                  </div>
                  {offMinutes > 0 && mins != null && (
                    <p className="text-xs text-muted-foreground">After {fmtMinutes(offMinutes)} of breaks</p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted-foreground">
                      Started
                      <Input type="time" value={d.inTime} onChange={(e) => patch(idx, { inTime: e.target.value })} className="mt-0.5 h-11" />
                    </label>
                    <label className="text-xs text-muted-foreground">
                      Finished
                      <Input type="time" value={d.outTime} onChange={(e) => patch(idx, { outTime: e.target.value })} className="mt-0.5 h-11" />
                    </label>
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Total crew time</span>
              <span className="font-semibold">{fmtMinutes(totalMinutes)}</span>
            </div>
            {invalid && <p className="text-xs text-red-600">A finish time must be after its start.</p>}
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button className="w-full h-12" onClick={drafts.length === 0 ? onClose : save} disabled={saving || (drafts.length > 0 && invalid)}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Done"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
