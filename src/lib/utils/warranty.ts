import { daysBetweenYmd } from "@/lib/time/zone";

/** Days before the end date at which a warranty reads as "expiring soon". */
export const WARRANTY_EXPIRING_DAYS = 90;

export type WarrantyState = "none" | "active" | "expiring" | "expired";

export interface WarrantyStatus {
  state: WarrantyState;
  /** Days from today until the end date; negative once expired. Null when there is no end date. */
  daysLeft: number | null;
}

/**
 * Add whole months to a "YYYY-MM-DD", clamping to the target month's last day
 * (Jan 31 + 1 month = Feb 28/29, not Mar 3).
 */
export function addMonthsYmd(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const targetMonth = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * The date a warranty entered as a period ends: the day before the same date
 * `months` later, so a 12-month warranty from 2026-03-15 covers through
 * 2027-03-14.
 */
export function warrantyEndFromTerm(startDate: string, months: number): string {
  const end = addMonthsYmd(startDate, months);
  const [y, m, d] = end.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export function getWarrantyStatus(endDate: string | null, today: string): WarrantyStatus {
  if (!endDate) return { state: "none", daysLeft: null };
  const daysLeft = daysBetweenYmd(today, endDate);
  if (daysLeft < 0) return { state: "expired", daysLeft };
  if (daysLeft <= WARRANTY_EXPIRING_DAYS) return { state: "expiring", daysLeft };
  return { state: "active", daysLeft };
}

/** "3 years", "18 months", "1 year 6 months". */
export function formatWarrantyTerm(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/** "Expires in 42 days", "Expired 3 months ago", "Expires today". */
export function formatWarrantyCountdown(daysLeft: number): string {
  const abs = Math.abs(daysLeft);
  const span =
    abs < 60 ? `${abs} day${abs === 1 ? "" : "s"}` :
    abs < 730 ? `${Math.round(abs / 30.44)} months` :
    `${(abs / 365.25).toFixed(1)} years`;
  if (daysLeft === 0) return "Expires today";
  return daysLeft > 0 ? `Expires in ${span}` : `Expired ${span} ago`;
}

// ── Form <-> record ─────────────────────────────────────────────────────────
// The form lets a warranty be entered either as an end date or as a coverage
// period from a start date. Either way the record stores the end date, which
// is what every report reads; a period also keeps its start and term so it
// reopens in the same shape it was entered.

export interface WarrantyRecordFields {
  warrantyStartDate: string | null;
  warrantyTermMonths: number | null;
  warrantyEndDate: string | null;
  warrantyNotes: string | null;
}

export interface WarrantyFormValue {
  mode: "end_date" | "term";
  /** Blank = coverage starts on the purchase date. */
  startDate: string;
  termValue: string;
  termUnit: "months" | "years";
  endDate: string;
  notes: string;
}

export const EMPTY_WARRANTY_FORM: WarrantyFormValue = {
  mode: "end_date",
  startDate: "",
  termValue: "",
  termUnit: "years",
  endDate: "",
  notes: "",
};

export function warrantyFormFromRecord(r: WarrantyRecordFields): WarrantyFormValue {
  const months = r.warrantyTermMonths;
  if (months) {
    const inYears = months % 12 === 0;
    return {
      mode: "term",
      startDate: r.warrantyStartDate ?? "",
      termValue: String(inYears ? months / 12 : months),
      termUnit: inYears ? "years" : "months",
      endDate: r.warrantyEndDate ?? "",
      notes: r.warrantyNotes ?? "",
    };
  }
  return {
    ...EMPTY_WARRANTY_FORM,
    startDate: r.warrantyStartDate ?? "",
    endDate: r.warrantyEndDate ?? "",
    notes: r.warrantyNotes ?? "",
  };
}

export interface ResolvedWarranty {
  fields: WarrantyRecordFields;
  /** Why the entry can't be saved yet; null when it can. */
  error: string | null;
}

export function resolveWarrantyForm(v: WarrantyFormValue, purchaseDate: string | null): ResolvedWarranty {
  const notes = v.notes.trim() || null;
  if (v.mode === "term") {
    const n = Number(v.termValue);
    if (v.termValue.trim() === "") {
      return { fields: { warrantyStartDate: null, warrantyTermMonths: null, warrantyEndDate: null, warrantyNotes: notes }, error: null };
    }
    if (!Number.isInteger(n) || n <= 0) {
      return { fields: { warrantyStartDate: null, warrantyTermMonths: null, warrantyEndDate: null, warrantyNotes: notes }, error: "Enter the coverage period as a whole number." };
    }
    const months = v.termUnit === "years" ? n * 12 : n;
    if (months > 600) {
      return { fields: { warrantyStartDate: null, warrantyTermMonths: null, warrantyEndDate: null, warrantyNotes: notes }, error: "A warranty can't be longer than 50 years." };
    }
    const start = v.startDate || purchaseDate;
    if (!start) {
      return { fields: { warrantyStartDate: null, warrantyTermMonths: null, warrantyEndDate: null, warrantyNotes: notes }, error: "Add a warranty start date or a purchase date so the end date can be worked out." };
    }
    return {
      fields: { warrantyStartDate: start, warrantyTermMonths: months, warrantyEndDate: warrantyEndFromTerm(start, months), warrantyNotes: notes },
      error: null,
    };
  }
  const start = v.startDate || null;
  const end = v.endDate || null;
  if (start && end && end < start) {
    return { fields: { warrantyStartDate: start, warrantyTermMonths: null, warrantyEndDate: end, warrantyNotes: notes }, error: "The warranty end date is before its start date." };
  }
  return { fields: { warrantyStartDate: start, warrantyTermMonths: null, warrantyEndDate: end, warrantyNotes: notes }, error: null };
}
