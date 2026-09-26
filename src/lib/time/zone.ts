// ============================================================
// Timezone primitives.
//
// Every date question in this app is one of three different questions, and
// picking the wrong one is the most common date bug here:
//
//   1. The ORG's day — which service day is this, what date does this invoice
//      carry, what "today" means in a report. This module answers that one.
//      The zone comes from organizations.timezone (see org_timezone() in SQL,
//      useOrgTimeZone() on the client, getOrgTimeZone() on the server).
//   2. The VIEWER's day — `toLocalISODate` in lib/utils. Legitimate only as a
//      convenience default in a date input. A manager in Denver must still
//      see the crew's day, not their own.
//   3. The UTC day — `toISOString().slice(0,10)`, SQL `current_date`. Almost
//      never what's wanted: Supabase sessions run TimeZone=UTC and Vercel's
//      Node runtime is UTC, so both roll over mid-evening in the Americas.
//
// Every function here takes the zone explicitly. There is deliberately no
// ambient default inside these functions — an implicit fallback is how a
// Pacific org silently gets Eastern dates.
// ============================================================

/**
 * The zone an org gets when it has never chosen one. Matches the DB default
 * on organizations.timezone; changing one without the other creates a split
 * brain where SQL and TypeScript disagree about what day it is.
 */
export const DEFAULT_TIME_ZONE = "America/New_York";

/** True when the runtime recognizes `tz` as an IANA zone name. */
export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Falls back to the platform default for a missing/garbage stored value. */
export function coerceTimeZone(tz: string | null | undefined): string {
  if (!tz || !isValidTimeZone(tz)) return DEFAULT_TIME_ZONE;
  return tz;
}

/** {year, month (0-based), day} of instant `d` as they appear in `timeZone`. */
export function zoneDateParts(
  d: Date,
  timeZone: string
): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/**
 * Format a year/month(0-based)/day as "YYYY-MM-DD", normalizing overflow and
 * underflow (month -1, day 0, day 32) the way the Date constructor does. Uses
 * a UTC anchor purely for that rollover arithmetic — no local or org zone is
 * involved, so this is safe to call from anywhere.
 */
export function ymd(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** The calendar date ("YYYY-MM-DD") that instant `d` falls on in `timeZone`. */
export function isoInZone(d: Date, timeZone: string): string {
  const { year, month, day } = zoneDateParts(d, timeZone);
  return ymd(year, month, day);
}

/** Today's date ("YYYY-MM-DD") in `timeZone`. */
export function todayInZone(timeZone: string): string {
  return isoInZone(new Date(), timeZone);
}

/** Add `days` (may be negative) to a "YYYY-MM-DD", returning "YYYY-MM-DD". */
export function shiftYmd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(y, m - 1, d + days);
}

/** Monday of the week containing a "YYYY-MM-DD" (weeks start Monday). */
/** Whole calendar days from `fromYmd` to `toYmd` (both "YYYY-MM-DD"); negative
 *  when `toYmd` is earlier. Pure date arithmetic — no clock, no zone. */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd.slice(0, 10)}T00:00:00Z`) - Date.parse(`${fromYmd.slice(0, 10)}T00:00:00Z`)) / 86400000);
}

export function mondayOfYmd(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const dow = anchor.getUTCDay(); // 0 = Sun .. 6 = Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return shiftYmd(dateStr, diff);
}

/**
 * A `Date` at the HOST's local midnight of today's date in `timeZone`.
 *
 * For callers that do recurrence arithmetic with local components
 * (getDay/getDate/setDate) and serialize with a local-component formatter.
 * That convention is self-consistent, but only if the Date it starts from is
 * the right DAY — seeding with `new Date()` uses the host's day, and the host
 * is UTC on Vercel.
 */
export function todayInZoneAsLocalMidnight(timeZone: string): Date {
  const { year, month, day } = zoneDateParts(new Date(), timeZone);
  return new Date(year, month, day);
}

/** The hour (0-23) that instant `d` falls on in `timeZone`. */
export function hourInZone(d: Date, timeZone: string): number {
  return zoneWallParts(d, timeZone).hour;
}

/**
 * Render an INSTANT (a timestamptz such as completed_at) as it reads on the
 * org's wall clock.
 *
 * Distinct from formatting a value that is already date-only: passing a
 * timestamp to a plain toLocaleDateString renders it in the VIEWER's zone, so
 * a visit completed at 00:53 UTC shows one date in Boston and the previous
 * date on the west coast.
 */
export function formatInZone(
  isoString: string | null | undefined,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }
): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone }).format(d);
}

/**
 * The zones offered in the org settings picker. Deliberately a short list of
 * US operating zones plus the ones a franchise might plausibly need, rather
 * than all ~600 IANA names — the DB validates against pg_timezone_names, so
 * anything else can still be set directly if a tenant ever needs it.
 */
export const SELECTABLE_TIME_ZONES: { value: string; label: string }[] = [
  { value: "America/New_York",   label: "Eastern (New York)" },
  { value: "America/Chicago",    label: "Central (Chicago)" },
  { value: "America/Denver",     label: "Mountain (Denver)" },
  { value: "America/Phoenix",    label: "Mountain — no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage",  label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu",   label: "Hawaii (Honolulu)" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
];

/** Wall-clock parts of `d` in `timeZone`, including the hour. */
function zoneWallParts(
  d: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  // "24" shows up for midnight with hour12:false in some environments.
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far `timeZone` is from UTC (ms) at instant `d` — negative behind UTC. */
function zoneOffsetMs(d: Date, timeZone: string): number {
  const p = zoneWallParts(d, timeZone);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, d.getUTCMilliseconds());
  return wall - d.getTime();
}

/**
 * The ISO instant of midnight (start of today) in `timeZone`.
 *
 * The offset is re-derived at the midnight guess itself, not just at `now`,
 * so a DST-transition day — where the offset changes at 2 AM local — still
 * lands on the true local midnight rather than an hour either side of it.
 */
export function startOfTodayInZoneIso(now: Date, timeZone: string): string {
  const { year, month, day } = zoneWallParts(now, timeZone);
  const wallMidnight = Date.UTC(year, month - 1, day);
  const guess = new Date(wallMidnight - zoneOffsetMs(now, timeZone));
  return new Date(wallMidnight - zoneOffsetMs(guess, timeZone)).toISOString();
}

/**
 * The first day of the month ("YYYY-MM-01") that instant `d` falls in, on
 * `timeZone`'s calendar.
 *
 * This is a billing-period KEY, so every writer and reader of a given period
 * must derive it the same way. Computing it from the UTC month means that on
 * the evening of a month's last day the key has already advanced — usage gets
 * written under next month while the org is still in this one.
 */
export function monthStartInZone(d: Date, timeZone: string): string {
  const { year, month } = zoneDateParts(d, timeZone);
  return ymd(year, month, 1);
}
