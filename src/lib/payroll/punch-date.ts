import { isoInZone, shiftYmd, zoneWallClockToInstant } from "@/lib/time/zone";

/** The parts of a crm_crew_day_shifts row the punch-date rule reads. */
export interface PunchShiftWindow {
  work_date: string;
  started_at: string;
  ended_at: string | null;
}

/** An open shift can't claim punches more than this long past its work date's midnight. */
const OPEN_SHIFT_GRACE_MS = 6 * 3_600_000;

/**
 * The work date payroll files a job punch under: the work_date of the member's
 * day shift covering the punch instant when there is one — a punch at 1am on a
 * storm shift started the evening before belongs to that earlier day — else the
 * punch's own org-local date.
 *
 * Only the previous local day's shift can claim the punch. An ended shift
 * claims started_at → ended_at; an open one claims until 6 hours past its work
 * date's midnight, or the member's next shift start if earlier.
 *
 * The database's payroll lock uses the same rule (payroll_punch_work_date()),
 * so a punch is locked on exactly the day payroll pays it. Pure: safe in client
 * components.
 */
export function payrollPunchDate(
  shiftFor: (memberId: string, workDate: string) => PunchShiftWindow | undefined,
  memberId: string,
  clockedInAt: string,
  tz: string
): string {
  const localDate = isoInZone(new Date(clockedInAt), tz);
  const prev = shiftFor(memberId, shiftYmd(localDate, -1));
  if (!prev) return localDate;
  const at = new Date(clockedInAt).getTime();
  const startMs = new Date(prev.started_at).getTime();
  let endMs: number;
  if (prev.ended_at) {
    endMs = new Date(prev.ended_at).getTime();
  } else {
    const midnight = zoneWallClockToInstant(shiftYmd(prev.work_date, 1), "00:00", tz);
    endMs = (midnight ? midnight.getTime() : startMs) + OPEN_SHIFT_GRACE_MS;
    const next = shiftFor(memberId, localDate);
    if (next) endMs = Math.min(endMs, new Date(next.started_at).getTime());
  }
  return at >= startMs && at <= endMs ? prev.work_date : localDate;
}
