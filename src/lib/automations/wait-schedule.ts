import { instantToZoneWallClock, shiftYmd, zoneWallClockToInstant } from "@/lib/time/zone";

// Wait step's "advanced" settings, applied AFTER the days/hours/minutes delay:
//  - until_time ("HH:mm", org clock): hold until the next time the org's clock
//    reads that time — e.g. "wait 1 day, then send at 9:00".
//  - weekdays_only: if the result lands on a Saturday or Sunday (org
//    calendar), roll forward to Monday at the same wall-clock time.
// Both read the ORG's calendar, not the server's (UTC) one.

export interface WaitAdvancedConfig {
  until_time?: unknown;
  weekdays_only?: unknown;
}

function parseHhmm(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof v === "string" ? v.trim() : "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function weekdayOfYmd(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sun .. 6 = Sat
}

export function applyWaitAdvancedSettings(base: Date, config: WaitAdvancedConfig | null | undefined, timeZone: string): Date {
  const untilTime = parseHhmm(config?.until_time);
  const weekdaysOnly = config?.weekdays_only === true;
  if (!untilTime && !weekdaysOnly) return base;

  const wall = instantToZoneWallClock(base, timeZone);
  let date = wall.date;
  let time = wall.time.slice(0, 5);

  if (untilTime) {
    const sameDay = zoneWallClockToInstant(date, untilTime, timeZone);
    // Already past that time today (or the zone lookup failed) -> tomorrow.
    date = sameDay && sameDay.getTime() >= base.getTime() ? date : shiftYmd(date, 1);
    time = untilTime;
  }
  if (weekdaysOnly) {
    const dow = weekdayOfYmd(date);
    if (dow === 6) date = shiftYmd(date, 2);
    else if (dow === 0) date = shiftYmd(date, 1);
    // A weekend landing with no until_time restarts the day at the same clock time.
  }
  return zoneWallClockToInstant(date, time, timeZone) ?? base;
}
