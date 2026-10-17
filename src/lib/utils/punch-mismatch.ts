import type { CRMJobVisit, CrewMemberTime } from "@/types/crm-jobs";
import { computeActualHours } from "@/lib/utils/visit-hours";
import { instantToZoneWallClock } from "@/lib/time/zone";

// A crew member who arrives late or leaves early legitimately differs from the
// rest of the stop, so neither check compares individuals: the span check looks
// at the stop's earliest in / latest out, and the hours check only trips on a
// gap big enough to be more than one person's short shift.
const SPAN_TOLERANCE_MINUTES = 10;
const HOURS_TOLERANCE_ABS = 1;
const HOURS_TOLERANCE_REL = 0.15;

function minutesOfDay(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Shortest distance between two clock times, so 23:55 vs 00:05 is 10 minutes, not 1430. */
function clockDistance(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1440 - d);
}

function label(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/**
 * Whether the office-visible visit times/hours of a stop disagree with its crew
 * punches (crm_crew_member_times), which is what the Timesheet report reads
 * while Job Costing reads the visit. Returns a short human explanation, or
 * null when they agree or there is nothing to compare yet.
 *
 * `stopVisits` is every visit that clocks in/out together (punches live on the
 * stop's anchor, and each sibling holds its share of the hours, so hours are
 * compared across the whole stop).
 */
export function stopPunchMismatch({
  stopVisits,
  memberTimes,
  timeZone,
}: {
  stopVisits: CRMJobVisit[];
  memberTimes: CrewMemberTime[];
  timeZone: string;
}): string | null {
  const visits = stopVisits.filter((v) => v.status !== "cancelled" && v.status !== "skipped");
  const closed = memberTimes.filter((t) => t.clockedInAt && t.clockedOutAt);
  if (visits.length === 0 || closed.length === 0) return null;
  const anchor = visits[0];
  const issues: string[] = [];

  // 1. Start/End vs the earliest in and latest out across the crew.
  const firstIn = closed.map((t) => new Date(t.clockedInAt as string).getTime()).sort((a, b) => a - b)[0];
  const lastOut = closed.map((t) => new Date(t.clockedOutAt as string).getTime()).sort((a, b) => b - a)[0];
  const punchStart = instantToZoneWallClock(new Date(firstIn), timeZone).time;
  const punchEnd = instantToZoneWallClock(new Date(lastOut), timeZone).time;
  const visitStart = anchor.startTime ? anchor.startTime.slice(0, 5) : null;
  const visitEnd = anchor.endTime ? anchor.endTime.slice(0, 5) : null;
  const ps = minutesOfDay(punchStart);
  const pe = minutesOfDay(punchEnd);
  const vs = visitStart ? minutesOfDay(visitStart) : null;
  const ve = visitEnd ? minutesOfDay(visitEnd) : null;
  if (vs != null && ps != null && clockDistance(vs, ps) > SPAN_TOLERANCE_MINUTES) {
    issues.push(`Start is ${label(visitStart as string)} but the crew's first punch is ${label(punchStart)}`);
  }
  if (ve != null && pe != null && clockDistance(ve, pe) > SPAN_TOLERANCE_MINUTES) {
    issues.push(`End is ${label(visitEnd as string)} but the crew's last punch is ${label(punchEnd)}`);
  }

  // 2. Visit man-hours vs the punches' man-hours (net of the break and lunch).
  const visitBreakHours = Math.max(0, anchor.breakMinutes ?? 0) / 60;
  let punchHours = 0;
  for (const t of closed) {
    const spanHours = (new Date(t.clockedOutAt as string).getTime() - new Date(t.clockedInAt as string).getTime()) / 3_600_000;
    punchHours += Math.max(0, spanHours - (t.breakMinutes + t.lunchMinutes) / 60 - visitBreakHours);
  }
  const perVisit = visits.map((v) => computeActualHours(v));
  if (perVisit.every((h): h is number => h != null)) {
    const visitHours = perVisit.reduce((s, h) => s + h, 0);
    const gap = Math.abs(visitHours - punchHours);
    if (gap >= HOURS_TOLERANCE_ABS && gap / Math.max(visitHours, punchHours, 0.01) >= HOURS_TOLERANCE_REL) {
      issues.push(`Visit hours are ${visitHours.toFixed(1)} but crew punches total ${punchHours.toFixed(1)}`);
    }
  }

  return issues.length > 0 ? `${issues.join(". ")}. Timesheets read the punches — fix them in Edit Job Times if the visit is right.` : null;
}
