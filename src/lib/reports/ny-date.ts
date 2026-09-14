// ============================================================
// Timezone-aware date helpers for report date-range boundaries.
//
// This codebase hardcodes "America/New_York" as the org's operating
// timezone everywhere date/time display already accounts for timezone
// (there is no per-org configurable timezone). Report date boundaries
// ("today", "this month", "week to date", etc.) must be computed against
// the calendar date as it appears in America/New_York, not the server's
// local/UTC date — otherwise boundaries shift a few hours early/late
// depending on time of day and DST.
// ============================================================

const NY_TZ = "America/New_York";

/** {year, month (0-based), day} of `d` as they appear in America/New_York. */
export function nyDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: NY_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { year: get("year"), month: get("month") - 1, day: get("day") };
}

/**
 * Format a year/month(0-based)/day into "YYYY-MM-DD", normalizing
 * overflow/underflow (month -1, day 0, day 32, etc.) the same way the `Date`
 * constructor does. Uses a UTC anchor purely for the rollover arithmetic —
 * no local/host timezone is involved, so this is safe to call from anywhere.
 */
export function ymd(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month, day));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** The calendar date ("YYYY-MM-DD") that instant `d` falls on in America/New_York. */
export function isoNy(d: Date): string {
  const { year, month, day } = nyDateParts(d);
  return ymd(year, month, day);
}

/** Add `days` (may be negative) to a "YYYY-MM-DD" date string, returning "YYYY-MM-DD". */
export function shiftYmd(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return ymd(y, m - 1, d + days);
}

/** Monday of the week containing a "YYYY-MM-DD" date string (week starts Monday). */
export function mondayOfYmd(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  const dow = anchor.getUTCDay(); // 0 = Sun .. 6 = Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return shiftYmd(dateStr, diff);
}
