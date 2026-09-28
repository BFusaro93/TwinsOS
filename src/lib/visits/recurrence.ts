/**
 * Pure recurrence math shared by every place that turns a schedule into
 * dates: the daily cron (/api/cron/recurring-visits), the per-job generator
 * (/api/crm/jobs/generate-visits) and the Settings → Schedules preview. They
 * used to carry three separate copies that disagreed (ISO-week parity for
 * bi-weekly, missing every-3/4-weeks, ignored season windows...), so a
 * schedule could preview one set of dates and generate another.
 *
 * Everything works on "YYYY-MM-DD" strings with UTC date arithmetic, so the
 * result never depends on the server's or browser's local timezone. Callers
 * decide which calendar "today" is (the org's — see todayInZone).
 */

export type ScheduleFrequency = "weekly" | "bi_weekly" | "every_3_weeks" | "every_4_weeks" | "monthly";
export type WeekPattern = "even" | "odd" | "any";
export type WeekOfMonth = "first" | "second" | "third" | "fourth" | "last";

export interface ScheduleRule {
  frequency: ScheduleFrequency;
  /** 0 = Sunday … 6 = Saturday */
  dayIndex: number;
  /** bi_weekly only: which week of the 2-week cycle, relative to the anchor. */
  weekPattern?: WeekPattern | null;
  /** Stable phase reference for interval schedules (crm_schedules.anchor_date). */
  anchorDate?: string | null;
  /** monthly only */
  weekOfMonth?: WeekOfMonth | null;
  /** Season window, "MM-DD" (may wrap the year, e.g. 11-01 → 03-31). */
  seasonStart?: string | null;
  seasonEnd?: string | null;
}

/** Shape of a crm_schedules row as selected from the DB. */
export interface ScheduleRow {
  name: string;
  frequency: string;
  day_of_week: string;
  week_pattern?: string | null;
  anchor_date?: string | null;
  week_of_month?: string | null;
  season_start?: string | null;
  season_end?: string | null;
}

export const DAY_INDEX: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const INTERVAL_WEEKS: Record<Exclude<ScheduleFrequency, "monthly">, number> = {
  weekly: 1, bi_weekly: 2, every_3_weeks: 3, every_4_weeks: 4,
};

const WEEK_OF_MONTH_ORDINAL: Record<WeekOfMonth, number> = {
  first: 1, second: 2, third: 3, fourth: 4, last: -1,
};

/**
 * Phase reference used when a schedule has no anchor_date (and the caller has
 * no job start date to offer). A Monday, so weeks run Mon–Sun like ISO weeks,
 * and chosen so "even"/"odd" match the ISO week-number parity the old
 * generators used throughout 2026 — existing bi-weekly visits keep their
 * cadence. Unlike ISO parity it does not flip at a 53-week year boundary
 * (2026 → 2027 would otherwise produce two "odd" weeks back to back).
 */
export const DEFAULT_WEEK_ANCHOR = "2025-12-22";

const DAY_MS = 86_400_000;

function ymdToUtcMs(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function utcMsToYmd(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  return utcMsToYmd(ymdToUtcMs(ymd) + days * DAY_MS);
}

function weekdayOf(ymd: string): number {
  return new Date(ymdToUtcMs(ymd)).getUTCDay();
}

function diffDays(a: string, b: string): number {
  return Math.round((ymdToUtcMs(a) - ymdToUtcMs(b)) / DAY_MS);
}

export function inSeason(ymd: string, seasonStart?: string | null, seasonEnd?: string | null): boolean {
  if (!seasonStart && !seasonEnd) return true;
  const md = ymd.slice(5);
  const start = seasonStart || "01-01";
  const end = seasonEnd || "12-31";
  return start <= end ? md >= start && md <= end : md >= start || md <= end;
}

function nthWeekdayOfMonth(year: number, month0: number, weekday: number, ordinal: number): string {
  if (ordinal === -1) {
    const last = new Date(Date.UTC(year, month0 + 1, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return utcMsToYmd(last.getTime() - back * DAY_MS);
  }
  const first = new Date(Date.UTC(year, month0, 1));
  const fwd = (weekday - first.getUTCDay() + 7) % 7;
  return utcMsToYmd(Date.UTC(year, month0, 1 + fwd + (ordinal - 1) * 7));
}

export interface OccurrenceOptions {
  /** Phase reference used when the rule has no anchorDate (e.g. the job's
   *  recurrence start). Falls back to DEFAULT_WEEK_ANCHOR. */
  fallbackAnchor?: string | null;
  /** Stop after this many dates. */
  limit?: number;
}

/**
 * Every date in [from, to] (inclusive, "YYYY-MM-DD") on which `rule` occurs,
 * ascending. `to` may be null when `limit` is given (preview).
 */
export function scheduleOccurrences(
  rule: ScheduleRule,
  from: string,
  to: string | null,
  opts: OccurrenceOptions = {}
): string[] {
  const limit = opts.limit ?? Number.POSITIVE_INFINITY;
  // Hard stop so a null `to` with an unsatisfiable season can't spin forever.
  const hardEnd = to ?? addDaysYmd(from, 366 * 5);
  const out: string[] = [];
  if (rule.dayIndex < 0 || rule.dayIndex > 6) return out;

  if (rule.frequency === "monthly") {
    const ordinal = WEEK_OF_MONTH_ORDINAL[rule.weekOfMonth ?? "first"] ?? 1;
    let year = Number(from.slice(0, 4));
    let month0 = Number(from.slice(5, 7)) - 1;
    while (out.length < limit) {
      const d = nthWeekdayOfMonth(year, month0, rule.dayIndex, ordinal);
      if (d > hardEnd) break;
      if (d >= from && inSeason(d, rule.seasonStart, rule.seasonEnd)) out.push(d);
      month0++;
      if (month0 > 11) { month0 = 0; year++; }
    }
    return out;
  }

  const interval = INTERVAL_WEEKS[rule.frequency] ?? 1;
  // An explicit even/odd pattern is a property of the SCHEDULE (every job on
  // "Bi-Weekly Thursday – even" shares one cadence), so without an anchor it
  // uses the global reference, never an individual job's start date.
  const hasParity = rule.frequency === "bi_weekly" && (rule.weekPattern === "even" || rule.weekPattern === "odd");
  const anchor = rule.anchorDate || (hasParity ? null : opts.fallbackAnchor) || DEFAULT_WEEK_ANCHOR;
  // bi_weekly "odd" = the week after the anchor's; everything else (even /
  // any / unset) is in phase with the anchor's week.
  const wantedPhase = rule.frequency === "bi_weekly" && rule.weekPattern === "odd" ? 1 : 0;

  let cursor = addDaysYmd(from, (rule.dayIndex - weekdayOf(from) + 7) % 7);
  while (cursor <= hardEnd && out.length < limit) {
    // True floor (not truncation) so dates before the anchor keep alternating
    // correctly instead of producing two "week 0"s around it.
    const weekIndex = Math.floor(diffDays(cursor, anchor) / 7);
    const phase = ((weekIndex % interval) + interval) % interval;
    if (phase === wantedPhase && inSeason(cursor, rule.seasonStart, rule.seasonEnd)) out.push(cursor);
    cursor = addDaysYmd(cursor, 7);
  }
  return out;
}

const FREQUENCIES = new Set<ScheduleFrequency>(["weekly", "bi_weekly", "every_3_weeks", "every_4_weeks", "monthly"]);

/** crm_schedules row → rule. Null for an unusable row (bad weekday/frequency). */
export function ruleFromScheduleRow(row: ScheduleRow): ScheduleRule | null {
  const dayIndex = DAY_INDEX[(row.day_of_week ?? "").toLowerCase()];
  const freq = (row.frequency ?? "").toLowerCase().replace("biweekly", "bi_weekly") as ScheduleFrequency;
  if (dayIndex === undefined || !FREQUENCIES.has(freq)) return null;
  return {
    frequency: freq,
    dayIndex,
    weekPattern: (row.week_pattern as WeekPattern | null) ?? null,
    anchorDate: row.anchor_date ?? null,
    weekOfMonth: (row.week_of_month as WeekOfMonth | null) ?? null,
    seasonStart: row.season_start ?? null,
    seasonEnd: row.season_end ?? null,
  };
}

/**
 * Legacy schedule names with no matching crm_schedules row ("Weekly - Tuesday",
 * "Weekly Tuesday", "Bi-weekly - Monday - Even Weeks", "Bi-Weekly Thursday",
 * "Every 3 Weeks Monday", "Custom"...). The dash is optional — requiring it
 * missed most real schedule names. Falls back to schedule_days (weekly on
 * each listed day) when the name can't be parsed.
 */
export function parseLegacySchedule(schedule: string | null, scheduleDays: string[] | null): ScheduleRule[] {
  const fromDays = (): ScheduleRule[] =>
    (scheduleDays ?? [])
      .map((d) => DAY_INDEX[d.toLowerCase()])
      .filter((i): i is number => i !== undefined)
      .map((dayIndex) => ({ frequency: "weekly" as const, dayIndex }));

  if (!schedule || schedule.trim().toLowerCase() === "custom") return fromDays();
  const lower = schedule.trim().toLowerCase().replace(/\s+/g, " ");
  const sep = "\\s*(?:-\\s*)?";

  const weekly = lower.match(new RegExp(`^weekly${sep}(\\w+)$`));
  if (weekly && DAY_INDEX[weekly[1]] !== undefined) {
    return [{ frequency: "weekly", dayIndex: DAY_INDEX[weekly[1]] }];
  }
  const bi = lower.match(new RegExp(`^bi-?\\s?weekly${sep}(\\w+)(?:${sep}(even|odd)(?: weeks?)?)?$`));
  if (bi && DAY_INDEX[bi[1]] !== undefined) {
    return [{ frequency: "bi_weekly", dayIndex: DAY_INDEX[bi[1]], weekPattern: (bi[2] as WeekPattern | undefined) ?? "even" }];
  }
  const everyN = lower.match(new RegExp(`^every ([34]) weeks?${sep}(\\w+)$`));
  if (everyN && DAY_INDEX[everyN[2]] !== undefined) {
    return [{ frequency: everyN[1] === "3" ? "every_3_weeks" : "every_4_weeks", dayIndex: DAY_INDEX[everyN[2]] }];
  }
  return fromDays();
}

/** Rules for a job: its named crm_schedules row when one exists, else legacy parsing. */
export function rulesForJob(
  schedule: string | null,
  scheduleDays: string[] | null,
  schedulesByName: Map<string, ScheduleRow>
): ScheduleRule[] {
  const row = schedule ? schedulesByName.get(schedule) : undefined;
  const fromRow = row ? ruleFromScheduleRow(row) : null;
  return fromRow ? [fromRow] : parseLegacySchedule(schedule, scheduleDays);
}

/** Union of several rules' occurrences, ascending and de-duplicated. */
export function occurrencesForRules(
  rules: ScheduleRule[],
  from: string,
  to: string,
  opts: OccurrenceOptions = {}
): string[] {
  const all = new Set<string>();
  for (const r of rules) for (const d of scheduleOccurrences(r, from, to, opts)) all.add(d);
  return [...all].sort();
}
