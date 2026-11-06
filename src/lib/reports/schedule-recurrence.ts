import { hourInZone, isoInZone, shiftYmd, zoneWallClockToInstant } from "@/lib/time/zone";

// ============================================================
// Scheduled-report recurrence math (report_schedules). Pure — no DB, no
// React, no ambient clock or zone: callers pass `now` and the ORG's zone.
//
// Every wall-clock notion here ("today", "the day of week", "the hour") is
// on the owning org's calendar (organizations.timezone), never the server's:
// the cron runs on UTC, where an evening in the Americas is already tomorrow.
//
// A schedule sends at most once per org-local day. The cron's claim is
// "last_run_at is not today on the org's calendar" as a conditional UPDATE, so
// two cron ticks in the same hour (or a retried invocation) can't double-send;
// isDue() applies the same rule so the pre-filter and the claim agree.
// ============================================================

export const SCHEDULE_FREQUENCIES = ["once", "daily", "weekly", "monthly"] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export const MONTHLY_MODES = ["day_of_month", "nth_weekday"] as const;
export type MonthlyMode = (typeof MONTHLY_MODES)[number];

/** 1-4 = first..fourth, -1 = last. */
export const MONTH_WEEKS = [1, 2, 3, 4, -1] as const;
export type MonthWeek = (typeof MONTH_WEEKS)[number];

export interface ScheduleRecurrence {
  frequency: ScheduleFrequency;
  /** 0-23 on the org's clock. */
  hourLocal: number;
  /** weekly: 0 = Sun .. 6 = Sat. */
  weekdays: number[];
  monthlyMode: MonthlyMode | null;
  /** monthly/day_of_month: 1-31, clamped to the month's last day. */
  monthDay: number | null;
  monthWeek: MonthWeek | null;
  /** monthly/nth_weekday: 0 = Sun .. 6 = Sat. */
  monthWeekday: number | null;
  /** First org-local "YYYY-MM-DD" a run may happen (the run date for once). */
  startDate: string | null;
  /** Last org-local "YYYY-MM-DD" a run may happen, inclusive. */
  endDate: string | null;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const ORDINAL: Record<MonthWeek, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseYmd(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

/** Day of week (0 = Sun) of a calendar date — pure date math, no zone. */
export function weekdayOfYmd(date: string): number {
  const { y, m, d } = parseYmd(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Days in month `m` (1-12) of year `y`. */
export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** "Mar 1, 2027" for a "YYYY-MM-DD" — formatted on a UTC anchor so no zone shifts the day. */
export function formatYmd(date: string): string {
  const { y, m, d } = parseYmd(date);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

/** "7:00 AM" for an hour 0-23. */
export function formatHour(hour: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * Drops fields that don't apply to the frequency, de-dupes/sorts weekdays,
 * and clears end_date on a one-off — so what's stored is exactly what drives
 * the schedule (and the DB's recurrence CHECK sees a clean row).
 */
export function normalizeRecurrence(r: ScheduleRecurrence): ScheduleRecurrence {
  const base: ScheduleRecurrence = {
    frequency: r.frequency,
    hourLocal: r.hourLocal,
    weekdays: [],
    monthlyMode: null,
    monthDay: null,
    monthWeek: null,
    monthWeekday: null,
    startDate: r.startDate || null,
    endDate: r.endDate || null,
  };
  switch (r.frequency) {
    case "once":
      return { ...base, endDate: null };
    case "weekly":
      return { ...base, weekdays: Array.from(new Set(r.weekdays)).sort((a, b) => a - b) };
    case "monthly":
      return r.monthlyMode === "nth_weekday"
        ? { ...base, monthlyMode: "nth_weekday", monthWeek: r.monthWeek, monthWeekday: r.monthWeekday }
        : { ...base, monthlyMode: "day_of_month", monthDay: r.monthDay };
    default:
      return base;
  }
}

/** First user-facing problem with a recurrence, or null when it's complete. */
export function recurrenceProblem(r: ScheduleRecurrence): string | null {
  if (!Number.isInteger(r.hourLocal) || r.hourLocal < 0 || r.hourLocal > 23) return "Pick a send time.";
  if (r.startDate && !YMD_RE.test(r.startDate)) return "Start date is invalid.";
  if (r.endDate && !YMD_RE.test(r.endDate)) return "End date is invalid.";
  if (r.startDate && r.endDate && r.endDate < r.startDate) return "End date must be on or after the start date.";
  switch (r.frequency) {
    case "once":
      return r.startDate ? null : "Pick the date to send on.";
    case "weekly":
      if (r.weekdays.length === 0) return "Pick at least one day of the week.";
      return r.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ? null : "Invalid day of the week.";
    case "monthly":
      if (r.monthlyMode === "day_of_month") {
        return r.monthDay !== null && r.monthDay >= 1 && r.monthDay <= 31 ? null : "Pick a day of the month (1-31).";
      }
      if (r.monthlyMode === "nth_weekday") {
        if (r.monthWeek === null || !MONTH_WEEKS.includes(r.monthWeek)) return "Pick first, second, third, fourth or last.";
        return r.monthWeekday !== null && r.monthWeekday >= 0 && r.monthWeekday <= 6 ? null : "Pick a day of the week.";
      }
      return "Pick how the monthly date is chosen.";
    default:
      return null;
  }
}

/**
 * Is `date` ("YYYY-MM-DD", org-local) a scheduled run date? Honors the
 * start/end window. For `once` this is only its start_date — the cron's
 * catch-up for a missed one-off is handled in isDue.
 */
export function isOccurrenceDate(r: ScheduleRecurrence, date: string): boolean {
  if (r.startDate && date < r.startDate) return false;
  if (r.endDate && date > r.endDate) return false;
  switch (r.frequency) {
    case "once":
      return date === r.startDate;
    case "daily":
      return true;
    case "weekly":
      return r.weekdays.includes(weekdayOfYmd(date));
    case "monthly": {
      const { y, m, d } = parseYmd(date);
      const dim = daysInMonth(y, m);
      if (r.monthlyMode === "day_of_month") {
        return r.monthDay !== null && d === Math.min(r.monthDay, dim);
      }
      if (r.monthlyMode === "nth_weekday") {
        if (r.monthWeekday === null || r.monthWeek === null) return false;
        if (weekdayOfYmd(date) !== r.monthWeekday) return false;
        return r.monthWeek === -1 ? d + 7 > dim : Math.ceil(d / 7) === r.monthWeek;
      }
      return false;
    }
  }
}

/** Has this schedule already run (claimed) on the org-local day of `now`? */
export function ranOnOrgDay(lastRunAt: string | null, now: Date, timeZone: string): boolean {
  if (!lastRunAt) return false;
  const last = new Date(lastRunAt);
  if (Number.isNaN(last.getTime())) return false;
  return isoInZone(last, timeZone) === isoInZone(now, timeZone);
}

/**
 * Should the cron send this (enabled) schedule now?
 *
 * Recurring: today (org-local) is a run date, the org's clock has reached
 * hour_local ("at or after", not "equal": a cron tick can land a few minutes
 * late), and it hasn't already run today. A missed recurring day is not
 * caught up the next day — the next email is the next scheduled one.
 *
 * Once: due from its start_date's hour onward until it succeeds (the cron
 * then disables it), so a one-off missed by a cron outage still goes out —
 * but still no more than once per org-local day.
 */
export function isDue(r: ScheduleRecurrence, now: Date, timeZone: string, lastRunAt: string | null): boolean {
  if (ranOnOrgDay(lastRunAt, now, timeZone)) return false;
  const today = isoInZone(now, timeZone);
  const hour = hourInZone(now, timeZone);
  if (r.frequency === "once") {
    if (!r.startDate || today < r.startDate) return false;
    return today > r.startDate || hour >= r.hourLocal;
  }
  return isOccurrenceDate(r, today) && hour >= r.hourLocal;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * When this schedule will next send, as an instant (null = never again:
 * paused, ended, or a one-off that already went out). May be in the past
 * when a run is due but the hourly cron hasn't picked it up yet — show that
 * as "due". Searches at most ~13 months ahead, which covers every rule.
 */
export function nextRunAt(
  r: ScheduleRecurrence,
  now: Date,
  timeZone: string,
  lastRunAt: string | null,
  enabled: boolean
): Date | null {
  if (!enabled) return null;
  const today = isoInZone(now, timeZone);
  const ranToday = ranOnOrgDay(lastRunAt, now, timeZone);
  const time = `${pad2(r.hourLocal)}:00`;

  if (r.frequency === "once") {
    if (!r.startDate) return null;
    if (r.startDate >= today && !(r.startDate === today && ranToday)) {
      return zoneWallClockToInstant(r.startDate, time, timeZone);
    }
    // Past its date and still enabled = not yet delivered: the cron retries
    // on its next tick (or tomorrow's first tick if it already tried today).
    const retryDay = ranToday ? shiftYmd(today, 1) : today;
    return ranToday ? zoneWallClockToInstant(retryDay, "00:00", timeZone) : now;
  }

  let date = r.startDate && r.startDate > today ? r.startDate : today;
  for (let i = 0; i < 400; i++, date = shiftYmd(date, 1)) {
    if (r.endDate && date > r.endDate) return null;
    if (date === today && ranToday) continue;
    if (isOccurrenceDate(r, date)) return zoneWallClockToInstant(date, time, timeZone);
  }
  return null;
}

/** "Weekly on Mon, Wed at 7:00 AM", "Monthly on the last Friday at 7:00 AM", … */
export function describeRecurrence(r: ScheduleRecurrence, today?: string): string {
  const at = `at ${formatHour(r.hourLocal)}`;
  let text: string;
  switch (r.frequency) {
    case "once":
      return r.startDate ? `Once on ${formatYmd(r.startDate)} ${at}` : `Once ${at}`;
    case "daily":
      text = `Daily ${at}`;
      break;
    case "weekly":
      text =
        r.weekdays.length === 7
          ? `Weekly, every day ${at}`
          : `Weekly on ${r.weekdays.map((d) => WEEKDAY_SHORT[d] ?? "?").join(", ")} ${at}`;
      break;
    case "monthly":
      if (r.monthlyMode === "nth_weekday" && r.monthWeek !== null && r.monthWeekday !== null) {
        text = `Monthly on the ${ORDINAL[r.monthWeek]} ${WEEKDAY_LONG[r.monthWeekday]} ${at}`;
      } else if (r.monthDay !== null) {
        text = `Monthly on day ${r.monthDay}${r.monthDay > 28 ? " (or the last day)" : ""} ${at}`;
      } else {
        text = `Monthly ${at}`;
      }
      break;
  }
  if (r.startDate && (!today || r.startDate > today)) text += `, starting ${formatYmd(r.startDate)}`;
  if (r.endDate) text += `, until ${formatYmd(r.endDate)}`;
  return text;
}

/** The recurrence stored on a report_schedules row. */
export function recurrenceFromRow(row: {
  frequency: string;
  hour_local: number;
  weekdays: number[] | null;
  monthly_mode: string | null;
  month_day: number | null;
  month_week: number | null;
  month_weekday: number | null;
  start_date: string | null;
  end_date: string | null;
}): ScheduleRecurrence {
  const frequency = (SCHEDULE_FREQUENCIES as readonly string[]).includes(row.frequency)
    ? (row.frequency as ScheduleFrequency)
    : "daily";
  const monthlyMode = (MONTHLY_MODES as readonly string[]).includes(row.monthly_mode ?? "")
    ? (row.monthly_mode as MonthlyMode)
    : null;
  const monthWeek = (MONTH_WEEKS as readonly number[]).includes(row.month_week ?? 0)
    ? (row.month_week as MonthWeek)
    : null;
  return {
    frequency,
    hourLocal: row.hour_local,
    weekdays: row.weekdays ?? [],
    monthlyMode,
    monthDay: row.month_day,
    monthWeek,
    monthWeekday: row.month_weekday,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

/** Column values for writing a recurrence to report_schedules. */
export function recurrenceToColumns(r: ScheduleRecurrence) {
  const n = normalizeRecurrence(r);
  return {
    frequency: n.frequency,
    hour_local: n.hourLocal,
    weekdays: n.weekdays,
    monthly_mode: n.monthlyMode,
    month_day: n.monthDay,
    month_week: n.monthWeek,
    month_weekday: n.monthWeekday,
    start_date: n.startDate,
    end_date: n.endDate,
  };
}
