import { isoInZone, shiftYmd, ymd } from "@/lib/time/zone";

// Relative date windows for scheduled custom analyses. A saved analysis holds
// fixed dates, so a recurring send would repeat a stale range; a schedule can
// instead name a window that is recomputed at send time on the ORG's calendar.
// "Last N days" windows END YESTERDAY (a 7 AM send should not include a partial
// today); month/year-to-date windows run through today.

export const DATE_WINDOWS = [
  "yesterday",
  "last_7_days",
  "last_30_days",
  "month_to_date",
  "this_month",
  "last_month",
  "year_to_date",
  "this_year",
  "last_year",
] as const;
export type DateWindow = (typeof DATE_WINDOWS)[number];

export const DATE_WINDOW_LABELS: Record<DateWindow, string> = {
  yesterday: "Yesterday",
  last_7_days: "Last 7 days (through yesterday)",
  last_30_days: "Last 30 days (through yesterday)",
  month_to_date: "Month to date",
  this_month: "This month (full month)",
  last_month: "Last month",
  year_to_date: "Year to date",
  this_year: "This year (full year)",
  last_year: "Last year",
};

export function isDateWindow(v: unknown): v is DateWindow {
  return typeof v === "string" && (DATE_WINDOWS as readonly string[]).includes(v);
}

/** Inclusive [from, to] "YYYY-MM-DD" for `window`, given today's date on the org's calendar. */
export function dateWindowRange(window: DateWindow, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const month0 = m - 1;
  const yesterday = shiftYmd(today, -1);
  switch (window) {
    case "yesterday":
      return { from: yesterday, to: yesterday };
    case "last_7_days":
      return { from: shiftYmd(today, -7), to: yesterday };
    case "last_30_days":
      return { from: shiftYmd(today, -30), to: yesterday };
    case "month_to_date":
      return { from: ymd(y, month0, 1), to: today };
    case "this_month":
      return { from: ymd(y, month0, 1), to: ymd(y, month0 + 1, 0) };
    case "last_month":
      return { from: ymd(y, month0 - 1, 1), to: ymd(y, month0, 0) };
    case "year_to_date":
      return { from: ymd(y, 0, 1), to: today };
    case "this_year":
      return { from: ymd(y, 0, 1), to: ymd(y, 11, 31) };
    case "last_year":
      return { from: ymd(y - 1, 0, 1), to: ymd(y - 1, 11, 31) };
  }
}

/** The window for `now` as seen in `timeZone` (the org's zone). */
export function dateWindowRangeAt(window: DateWindow, now: Date, timeZone: string) {
  return dateWindowRange(window, isoInZone(now, timeZone));
}
