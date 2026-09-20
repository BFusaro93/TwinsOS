import type { BillingFrequency } from "@/types/crm-invoices";

/**
 * Single source of truth for WHEN a contract bills and WHAT WINDOW counts as
 * "already billed", shared by the daily cron
 * (src/app/api/cron/contract-invoices/route.ts) and the manual "Create
 * Invoices" click (useGenerateContractInvoices in
 * src/lib/hooks/use-contracts.ts).
 *
 * Why this exists: `crm_contracts.billing_frequency` was accepted, stored and
 * then read by nobody — both billing paths charged
 * `monthly_amounts[month] ?? monthly_amount_cents` on `billing_day_of_month`
 * unconditionally, so an `annual` contract was invoiced its full amount every
 * single month. Two independent copies of the schedule math is exactly how
 * that drift happens, so both callers go through here.
 *
 * ── What the amount means ─────────────────────────────────────────────────
 * `monthly_amount_cents` (and each `monthly_amounts` month override) is the
 * PER-INVOICE amount — the figure charged each time the contract bills, NOT
 * an annualised or monthly-equivalent figure that gets divided or multiplied
 * per frequency. An `annual` contract worth $12,000/yr stores 1200000 and is
 * invoiced $12,000 once a year. This is the only interpretation that cannot
 * over-bill: reading it as "per month, annualised" would turn that same
 * contract into $144,000/yr. The column name is historical (the table
 * predates non-monthly frequencies); it is not a unit.
 *
 * ── Cadence, per frequency ────────────────────────────────────────────────
 * Every non-monthly cadence is anchored on the contract's own timeline —
 * `start_date`, else the date part of `signed_at`, else `created_at` — never
 * on the calendar in the abstract, so two annual contracts signed in
 * different months bill in different months.
 *
 *  - `monthly`    — fires on `billing_day_of_month` (clamped to the month's
 *                   length). BIT-IDENTICAL to the pre-frequency behaviour:
 *                   same day, same amount, same `monthly_amounts` override,
 *                   same calendar-month idempotency window. This is live
 *                   billing against real clients; nothing here may move a
 *                   monthly invoice by a day or a cent.
 *  - `quarterly`  — same day-of-month rule, but only in months 0, 3, 6, 9 …
 *                   from the anchor month. Idempotency window is the whole
 *                   3-month quarter, so a manual click mid-quarter bills the
 *                   quarter and the cron then skips it.
 *  - `annual`     — same day-of-month rule, only in months 0, 12, 24 … from
 *                   the anchor month. Window is the whole 12-month year.
 *  - `one_time`   — bills once, EVER. Fires on the first run at or after the
 *                   anchor date; the window is unbounded (null/null), which
 *                   callers read as "any non-deleted invoice on this contract
 *                   at all blocks it".
 *  - `weekly` /   — every 7 / 14 days from the anchor DATE (not day-of-month;
 *    `biweekly`     `billing_day_of_month` is ignored, as is
 *                   `bill_month_in_advance`, neither of which has a meaning
 *                   on a sub-monthly cadence). The window is the 7/14-day
 *                   period containing the run date.
 *
 * ── Idempotency ───────────────────────────────────────────────────────────
 * Re-running either path inside the same period must never produce a second
 * invoice. Three layers, in order:
 *   1. `last_billed_date` inside the period (cheap, no query) — applied for
 *      non-monthly only, see billedInPeriod() for why monthly is exempt.
 *   2. an existing non-deleted `crm_invoices` row for the contract inside
 *      [periodStart, periodEnd] (or any row at all, for `one_time`).
 *   3. the `crm_invoices_one_per_contract_month` unique index as the
 *      concurrency backstop; both callers already map its 23505 to a skip.
 *
 * KNOWN LIMIT: that unique index is keyed on (contract_id, year, month), so
 * it physically caps ANY contract at one invoice per calendar month. Weekly
 * and biweekly contracts therefore generate their first invoice of a month
 * and get a 23505 "already billed" skip for the rest of it until the index is
 * replaced with one keyed on (contract_id, invoice_date). Failing that way
 * under-bills rather than over-bills, which is the correct direction to fail.
 */

export const MONTH_KEYS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
] as const;

export type MonthKey = (typeof MONTH_KEYS)[number];

/** The contract columns the schedule math needs. Both callers already select these. */
export interface BillingContractRow {
  billing_frequency?: string | null;
  billing_day_of_month?: number | null;
  bill_month_in_advance?: boolean | null;
  start_date?: string | null;
  signed_at?: string | null;
  created_at?: string | null;
  last_billed_date?: string | null;
}

export interface BillingPlan {
  frequency: BillingFrequency;
  /** Month key of the billing month — indexes `monthly_amounts`. */
  monthKey: MonthKey;
  /** `invoice_date` to stamp on the generated invoice (YYYY-MM-DD). */
  invoiceDate: string;
  /**
   * Inclusive "already billed" window, YYYY-MM-DD. Both null means unbounded
   * (`one_time`): any non-deleted invoice on the contract counts.
   */
  periodStart: string | null;
  periodEnd: string | null;
}

const VALID_FREQUENCIES: readonly BillingFrequency[] = [
  "weekly", "biweekly", "monthly", "quarterly", "annual", "one_time",
];

const MS_PER_DAY = 86_400_000;

/**
 * Anything unrecognised (or null, on a row written before the column existed)
 * falls back to "monthly" — the behaviour every contract had before
 * frequencies were honoured, so an unexpected value can't silently stop a
 * live contract from billing.
 */
export function normalizeBillingFrequency(raw: string | null | undefined): BillingFrequency {
  return VALID_FREQUENCIES.includes(raw as BillingFrequency) ? (raw as BillingFrequency) : "monthly";
}

interface Ymd { y: number; m: number; d: number }

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmt(p: Ymd): string {
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
}

/** Leading YYYY-MM-DD of a date or timestamptz string. Null if unparseable. */
function parseYmd(value: string | null | undefined): Ymd | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function toYmd(date: Date): Ymd {
  return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
}

/** m is 1-based. */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

/** Months since year 0 — lets month arithmetic wrap years without Date objects. */
function monthIndex(y: number, m: number): number {
  return y * 12 + (m - 1);
}

function fromMonthIndex(index: number): { y: number; m: number } {
  return { y: Math.floor(index / 12), m: (index % 12) + 1 };
}

/**
 * Whole days between two calendar dates. Uses Date.UTC so a DST transition
 * between the two never yields 6.96 days and floors to 6.
 */
function dayDiff(from: Ymd, to: Ymd): number {
  return Math.round((Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) / MS_PER_DAY);
}

function addDays(base: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(base.y, base.m - 1, base.d) + days * MS_PER_DAY);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/**
 * The date every non-monthly cadence counts from: the contract's own start,
 * else when it was signed, else when the row was created. `monthly` never
 * consults this — it fires purely on billing_day_of_month, exactly as before.
 */
export function billingAnchor(contract: BillingContractRow, today: Date): Ymd {
  return (
    parseYmd(contract.start_date) ??
    parseYmd(contract.signed_at) ??
    parseYmd(contract.created_at) ??
    toYmd(today)
  );
}

/**
 * Whether the daily cron should bill this contract today. Callers still apply
 * their own is_active / auto_generate / status / start_date / end_date gates —
 * this answers the cadence question only.
 */
export function isBillingDueOn(contract: BillingContractRow, today: Date): boolean {
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  const now = toYmd(today);

  // The pre-existing day-of-month rule, unchanged: a contract configured for
  // the 31st fires on the 30th (or 28th/29th) in shorter months rather than
  // skipping them.
  const configuredDay = contract.billing_day_of_month ?? 1;
  const dayMatches = Math.min(configuredDay, daysInMonth(now.y, now.m)) === now.d;

  switch (frequency) {
    case "monthly":
      return dayMatches;

    case "quarterly":
    case "annual": {
      if (!dayMatches) return false;
      const span = frequency === "quarterly" ? 3 : 12;
      const anchor = billingAnchor(contract, today);
      const monthsSinceAnchor = monthIndex(now.y, now.m) - monthIndex(anchor.y, anchor.m);
      // Negative means the anchor is still in the future (a contract signed
      // with a forward-dated start) — nothing to bill yet.
      return monthsSinceAnchor >= 0 && monthsSinceAnchor % span === 0;
    }

    case "weekly":
    case "biweekly": {
      const step = frequency === "weekly" ? 7 : 14;
      const elapsed = dayDiff(billingAnchor(contract, today), now);
      return elapsed >= 0 && elapsed % step === 0;
    }

    case "one_time":
      // Due from the anchor date onward; billedInPeriod() + the unbounded
      // window are what make it fire exactly once.
      return dayDiff(billingAnchor(contract, today), now) >= 0;
  }
}

/**
 * The invoice date, month key and idempotency window for billing `contract`
 * on `today`.
 *
 * `billNow` is what separates the two callers on a month-anchored frequency:
 * the cron dates the invoice on the contract's configured
 * `billing_day_of_month` (it only ever runs on that day anyway), while the
 * manual "Create Invoices" click dates it the day it was clicked. Both
 * behaviours are pre-existing and preserved exactly.
 */
export function planContractBilling(
  contract: BillingContractRow,
  today: Date,
  opts: { billNow: boolean }
): BillingPlan {
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  const now = toYmd(today);

  if (frequency === "weekly" || frequency === "biweekly") {
    // Sub-monthly cadences are date-anchored, so neither
    // billing_day_of_month nor bill_month_in_advance applies: the invoice is
    // dated the day the run happens, and the window is the 7/14-day period
    // that day falls in.
    const step = frequency === "weekly" ? 7 : 14;
    const anchor = billingAnchor(contract, today);
    const elapsed = dayDiff(anchor, now);
    const periodIndex = Math.floor(elapsed / step);
    const periodStart = addDays(anchor, periodIndex * step);
    return {
      frequency,
      monthKey: MONTH_KEYS[now.m - 1],
      invoiceDate: fmt(now),
      periodStart: fmt(periodStart),
      periodEnd: fmt(addDays(periodStart, step - 1)),
    };
  }

  // ── month-anchored: monthly / quarterly / annual / one_time ──────────────
  // "Bill month in advance" dates and labels the invoice for next calendar
  // month instead of the current one; the day is clamped to THAT month's
  // length, not today's.
  const advance = contract.bill_month_in_advance ? 1 : 0;
  const billingMonth = new Date(today.getFullYear(), today.getMonth() + advance, 1);
  const bmY = billingMonth.getFullYear();
  const bmM = billingMonth.getMonth() + 1;
  const bmLastDay = daysInMonth(bmY, bmM);
  // one_time fires on the first run at or after the anchor, not on a
  // day-of-month, so it dates its single invoice the day it actually runs —
  // otherwise a contract starting on the 10th with billing_day_of_month 1
  // would be invoiced with a date nine days in the past.
  const day =
    opts.billNow || frequency === "one_time"
      ? Math.min(now.d, bmLastDay)
      : Math.min(contract.billing_day_of_month ?? 1, bmLastDay);

  const plan: BillingPlan = {
    frequency,
    monthKey: MONTH_KEYS[bmM - 1],
    invoiceDate: fmt({ y: bmY, m: bmM, d: day }),
    periodStart: null,
    periodEnd: null,
  };

  // one_time keeps the unbounded window: "billed once, ever".
  if (frequency === "one_time") return plan;

  const span = frequency === "quarterly" ? 3 : frequency === "annual" ? 12 : 1;
  const billingMonthIdx = monthIndex(bmY, bmM);

  let startIdx = billingMonthIdx;
  if (span > 1) {
    // Align the window to the anchor's own quarter/year grid, shifted by the
    // same advance offset applied to the invoice date so the window always
    // contains it. Math.floor (not trunc) so months before the anchor still
    // land in a contiguous, non-overlapping window.
    const anchor = billingAnchor(contract, today);
    const anchorIdx = monthIndex(anchor.y, anchor.m) + advance;
    startIdx = anchorIdx + Math.floor((billingMonthIdx - anchorIdx) / span) * span;
  }

  const start = fromMonthIndex(startIdx);
  const end = fromMonthIndex(startIdx + span - 1);
  plan.periodStart = fmt({ y: start.y, m: start.m, d: 1 });
  plan.periodEnd = fmt({ y: end.y, m: end.m, d: daysInMonth(end.y, end.m) });
  return plan;
}

/**
 * Cheap pre-check: does `last_billed_date` already fall inside this plan's
 * period? Saves a round trip and, for `one_time`, is the guard that makes
 * "once, ever" hold even if the original invoice was later soft-deleted.
 *
 * Deliberately a no-op for `monthly`: that path's only idempotency check has
 * always been "is there a live invoice in this calendar month", so a voided
 * or deleted monthly invoice can be regenerated by re-running the cron.
 * Adding a last_billed_date gate would quietly take that recovery away from
 * live monthly billing, which is out of scope here.
 */
export function billedInPeriod(plan: BillingPlan, lastBilledDate: string | null | undefined): boolean {
  if (plan.frequency === "monthly") return false;
  const last = parseYmd(lastBilledDate);
  if (!last) return false;
  const lastStr = fmt(last);
  if (plan.periodStart === null && plan.periodEnd === null) return true; // one_time: ever billed
  return lastStr >= (plan.periodStart ?? lastStr) && lastStr <= (plan.periodEnd ?? lastStr);
}

/** Human-readable reason string for a skip, so both callers report it the same way. */
export function alreadyBilledReason(plan: BillingPlan): string {
  switch (plan.frequency) {
    case "one_time":
      return "one_time contract has already been billed";
    case "weekly":
    case "biweekly":
      return `already billed for this ${plan.frequency === "weekly" ? "week" : "two-week period"} (${plan.periodStart} – ${plan.periodEnd})`;
    case "quarterly":
      return `already billed for this quarter (${plan.periodStart} – ${plan.periodEnd})`;
    case "annual":
      return `already billed for this contract year (${plan.periodStart} – ${plan.periodEnd})`;
    default:
      return "already billed for this month";
  }
}
