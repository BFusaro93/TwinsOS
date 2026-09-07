import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a split address into a single display string.
 * Output: "123 Main St Springfield, MA 01234"
 * State and ZIP share no comma; street and city share no comma.
 */
export function formatAddress(address: string, city: string, state: string, zip: string): string {
  const streetCity = [address, city].filter(Boolean).join(" ");
  const stateZip = [state, zip].filter(Boolean).join(" ");
  return [streetCity, stateZip].filter(Boolean).join(", ");
}

export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function formatDate(isoString: string | null | undefined): string {
  // Gracefully handle empty, null, or undefined values.
  if (!isoString) return "—";
  // Date-only strings (YYYY-MM-DD) must be parsed as local time.
  // new Date("2025-04-15") treats it as UTC midnight, which shifts the display
  // date by one day in negative-offset timezones. Appending T00:00:00 forces
  // the JavaScript engine to use the local timezone instead.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(isoString)
    ? `${isoString}T00:00:00`
    : isoString;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "—";
  const datePart = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
  return `${datePart} at ${timePart}`;
}

/** MM/DD/YY, zero-padded (e.g. "07/25/26"). */
export function formatDateShort(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  // Date-only strings (YYYY-MM-DD) must be parsed as local time — see formatDate.
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(isoString)
    ? `${isoString}T00:00:00`
    : isoString;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/** Generates a deterministic Tailwind bg color class from a string (for vendor avatars) */
export function getAvatarColor(name: string): string {
  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-orange-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-rose-500",
    "bg-cyan-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Given a lastCompletedDate and a PM frequency, returns the ISO date string
 * for the next due date. If no lastCompletedDate is provided, returns null
 * (caller should fall back to the stored nextDueDate).
 */
export function calculateNextDueDate(
  lastCompletedDate: string | null,
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annual"
): string | null {
  if (!lastCompletedDate) return null;
  // Parse YYYY-MM-DD as local time (not UTC) to avoid timezone off-by-one.
  const [y, m, d] = lastCompletedDate.split("-").map(Number);
  const base = new Date(y, m - 1, d);

  const monthsToAdd =
    frequency === "monthly" ? 1 :
    frequency === "quarterly" ? 3 :
    frequency === "annual" ? 12 :
    0;

  if (monthsToAdd > 0) {
    // Building the target date from (year, targetMonthIndex, clampedDay)
    // rather than mutating via .setMonth()/.setFullYear() avoids JS Date's
    // month-overflow rollover: a schedule due Jan 31 advanced with
    // .setMonth(+1) landed on Mar 3 (Feb has only 28/29 days), silently
    // skipping February's occurrence entirely.
    const targetMonthIndex = base.getMonth() + monthsToAdd;
    const daysInTargetMonth = new Date(base.getFullYear(), targetMonthIndex + 1, 0).getDate();
    const next = new Date(base.getFullYear(), targetMonthIndex, Math.min(base.getDate(), daysInTargetMonth));
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  }

  switch (frequency) {
    case "daily":
      base.setDate(base.getDate() + 1);
      break;
    case "weekly":
      base.setDate(base.getDate() + 7);
      break;
  }
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

/**
 * Returns true when a record's string field matches the active filter.
 * Supports both single-value (legacy) and multi-value (array) filter modes.
 *   - undefined / empty array / "all"  → always matches (no filter active)
 *   - string[]                         → matches if value is in the array
 *   - string                           → matches if value === filter
 */
export function matchesFilter(
  value: string,
  filter: string | string[] | undefined
): boolean {
  if (!filter) return true;
  if (Array.isArray(filter)) return filter.length === 0 || filter.includes(value);
  return filter === "all" || filter === value;
}

/**
 * Same as matchesFilter but for boolean active/inactive patterns where options
 * are the strings "active" and "inactive" rather than the record field value.
 */
export function matchesIsActiveFilter(
  isActive: boolean,
  filter: string | string[] | undefined
): boolean {
  const check = (s: string): boolean => {
    if (s === "all") return true;
    if (s === "active") return isActive;
    if (s === "inactive") return !isActive;
    return true;
  };
  if (!filter) return true;
  if (Array.isArray(filter)) return filter.length === 0 || filter.some(check);
  return check(filter);
}

export function relativeTime(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(isoString);
}

/**
 * "YYYY-MM-DD" for a Date as it appears on the *browser's local* calendar.
 * `new Date().toISOString().slice(0, 10)` is the UTC date, which after ~8 PM
 * Eastern is already tomorrow — every `<input type="date">` default and every
 * client-side "today" comparison must use this instead. (Server/report code
 * uses the America/New_York helpers in src/lib/reports/ny-date.ts.)
 */
export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's local calendar date as "YYYY-MM-DD" — use for date-input defaults. */
export function todayLocalISODate(): string {
  return toLocalISODate(new Date());
}

/** Local calendar date `days` from today (negative = past) as "YYYY-MM-DD". */
export function localISODateFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
}

/**
 * Round an hours value for STORAGE (default 4 decimals). Budgeted hours are
 * derived from qty ÷ production rate and actual hours from clock deltas ×
 * men — both produce float noise like 0.00006666666666666667 or
 * 6.000000000000001 that would otherwise land in the DB and the audit trail.
 */
export function roundHours(hours: number, decimals = 4): number {
  if (!Number.isFinite(hours)) return 0;
  const f = 10 ** decimals;
  return Math.round(hours * f) / f;
}

/**
 * Format an hours value for DISPLAY — fixed decimals (default 2), no unit.
 * Use this everywhere budgeted/actual hours are rendered so "0.00006666…h"
 * and "6.000000000000001" never reach the UI. Null/undefined → "—".
 */
export function formatHours(hours: number | null | undefined, decimals = 2): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  return hours.toFixed(decimals);
}

/**
 * "9/7"-style month/day from a YYYY-MM-DD string — for compact activity-
 * timeline subjects like "Visit moved 9/7 → 9/8". No timezone math: the
 * string is split, never parsed through Date.
 */
export function formatMonthDay(ymd: string | null | undefined): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}/.test(ymd)) return "—";
  const [, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return `${m}/${d}`;
}

/**
 * "9:42 PM" from a 24h "HH:mm" / "HH:mm:ss" string — the shape a Postgres
 * `time` column (crm_job_visits.start_time/end_time) or a native
 * <input type="time"> value uses. Returns the input untouched when it isn't
 * a parseable time so a bad value is still visible rather than blanked.
 */
export function formatTimeOfDay(value: string | null | undefined): string {
  if (!value) return "";
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr);
  const m = Number(mStr ?? "0");
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
