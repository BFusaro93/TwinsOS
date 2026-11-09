import type { BillingFrequency } from "@/types/crm-invoices";
import { coerceTimeZone, isoInZone } from "@/lib/time/zone";

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
 *  - `quarterly`  — same day-of-month rule, but only every 3rd month of the
 *                   contract's cycle grid (see monthGrid: from the first
 *                   billing day on/after the start date, pinned by
 *                   billing_anchor_date once billing begins). Idempotency
 *                   window is the whole 3-month quarter, so a manual click
 *                   mid-quarter bills the quarter and the cron then skips it.
 *  - `annual`     — same, every 12th month. Window is the whole year.
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
 *   3. the `crm_invoices_one_per_contract_date` unique index on
 *      (contract_id, invoice_date) as the concurrency backstop; both callers
 *      map its 23505 to a skip. It is per billing DATE, so weekly/biweekly
 *      contracts can legitimately hold several invoices in one month.
 *
 * ── The contract term ─────────────────────────────────────────────────────
 * Start: no invoice is dated before `start_date`, and no regular invoice pays
 * for a billing cycle that BEGINS before it. A contract starting mid-cycle
 * therefore bills the first cycle starting on/after its start date
 * (`first_full_cycle`), or a prorated stub for the gap and then that cycle
 * (`prorate_first_period`, see planFirstPeriodProration). Monthly cycles
 * start on billing_day_of_month every month; quarterly/annual cycles every
 * 3/12 months from the first billing day on/after the start date (monthGrid).
 * End: the last cycle that starts on or before `end_date` is billed in full.
 *
 * Late starts: a cycle whose billing day passed before the contract became
 * billable (entered, signed or activated late) is still billed by the next
 * run — dated that day, never back-dated — unless the client was reactivated
 * after the billing day.
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
  /**
   * Not a column. The org's IANA time zone, so the `signed_at`/`created_at`
   * instants become the org's calendar date (a contract signed at 9pm Eastern
   * on the 31st was signed on the 31st, not on the 1st as its UTC date says).
   * Callers that know the org set it; without it the UTC date is used.
   */
  time_zone?: string | null;
  /**
   * Not a column. The org-calendar date (YYYY-MM-DD) the contract became
   * billable — created, signed or switched to active (or its client
   * converted from a lead). The cron derives it from the audit trail; without
   * it the later of created_at / signed_at is used. A cycle whose billing day
   * passed before this is still billed by catch-up, but dated the day it is
   * created rather than back-dated to the billing day.
   */
  billable_since?: string | null;
  /**
   * Not a column. The org-calendar date (YYYY-MM-DD) the contract's client
   * was last REACTIVATED (cancelled / inactive / lost → active), from the
   * audit trail. Catch-up never bills a cycle whose billing day passed while
   * the client was off service.
   */
  client_active_since?: string | null;
  /**
   * `crm_contracts.billing_anchor_date`: the start of the first cycle a
   * quarterly/annual contract billed, stamped by the billing paths. It pins
   * the cycle grid once billing has begun, so the grid can never move under a
   * running contract. See monthGrid.
   */
  billing_anchor_date?: string | null;
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
  /**
   * First day of the billing cycle this invoice pays for (YYYY-MM-DD): the
   * billing day the cycle starts on for monthly/quarterly/annual (which is
   * the invoice date for the cron, but not for a manual click), the period
   * start for weekly/biweekly, the invoice date for one_time. termSkipReason
   * tests the contract term against it.
   */
  cycleStart: string;
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
 * The org-calendar date of a timestamptz (signed_at / created_at). With the
 * org's zone, the instant is converted; without it — or for a bare date —
 * the leading YYYY-MM-DD (the UTC date) is used, the historical behaviour.
 */
function instantToYmd(value: string | null | undefined, timeZone: string | null | undefined): Ymd | null {
  if (!value) return null;
  if (timeZone && /[T ]\d{2}:\d{2}/.test(value)) {
    const instant = new Date(value);
    if (!Number.isNaN(instant.getTime())) return parseYmd(isoInZone(instant, coerceTimeZone(timeZone)));
  }
  return parseYmd(value);
}

/**
 * The date every non-monthly cadence counts from: the contract's own start,
 * else when it was signed, else when the row was created (both as the org's
 * calendar date when `time_zone` is supplied). `monthly` never consults this
 * for its day — it fires purely on billing_day_of_month.
 */
export function billingAnchor(contract: BillingContractRow, today: Date): Ymd {
  return (
    parseYmd(contract.start_date) ??
    instantToYmd(contract.signed_at, contract.time_zone) ??
    instantToYmd(contract.created_at, contract.time_zone) ??
    toYmd(today)
  );
}

/**
 * When the contract became billable (org calendar): `billable_since` if the
 * caller resolved it (the cron does, from the audit trail), else the later of
 * created_at and signed_at. Null when the row carries none of them.
 */
function billableSince(contract: BillingContractRow): Ymd | null {
  const explicit = parseYmd(contract.billable_since);
  if (explicit) return explicit;
  const created = instantToYmd(contract.created_at, contract.time_zone);
  const signed = instantToYmd(contract.signed_at, contract.time_zone);
  if (created && signed) return dayDiff(created, signed) > 0 ? signed : created;
  return created ?? signed;
}

/**
 * Catch-up rail: may catch-up bill the cycle whose billing day is `billingDay`?
 * Not if the client was reactivated after it — that cycle passed while the
 * client was off service (reactivating resumes billing at the next cycle).
 * Imported contracts are protected separately: the import marks the period
 * in progress as already billed (last_billed_date).
 */
function clientActiveBy(contract: BillingContractRow, billingDay: Ymd): boolean {
  const reactivated = parseYmd(contract.client_active_since);
  return !reactivated || dayDiff(reactivated, billingDay) >= 0;
}

/**
 * The date a cron-made invoice for the cycle billed on `billingDay` carries:
 * the billing day itself — or, for a contract that only became billable after
 * that day (entered, signed or activated late), the day the invoice is
 * actually created, so it is never back-dated. Either date falls inside the
 * cycle's period window, which is what the idempotency checks key on.
 */
function cronInvoiceDate(contract: BillingContractRow, billingDay: Ymd, now: Ymd): string {
  const since = billableSince(contract);
  return since && dayDiff(billingDay, since) > 0 && dayDiff(billingDay, now) > 0 ? fmt(now) : fmt(billingDay);
}

// ── month-anchored cycle grid (monthly / quarterly / annual) ─────────────────

interface MonthGrid {
  span: number;
  advance: number;
  billingDay: number;
  /** Month index of a cycle start; cycles start every `span` months from it. */
  originIdx: number;
}

/**
 * The month-anchored cycle grid. Monthly cycles start every month. For
 * quarterly/annual, which months cycles start in:
 *  1. `billing_anchor_date` when stamped — the first cycle the contract
 *     actually billed, so a running contract's dates never move;
 *  2. a contract that has billed before the stamp existed
 *     (last_billed_date set): the original grid, counted from the anchor
 *     month (start → signed → created), one month later with "bill 1 month in
 *     advance" — exactly the dates it has always billed on;
 *  3. a contract that hasn't billed yet: the first billing day on/after the
 *     anchor date (start Mar 15, billing day 1 → cycles start Apr 1; start
 *     Mar 1 → Mar 1). "Bill 1 month in advance" then invoices each cycle a
 *     month before it starts rather than moving the grid.
 */
function monthGrid(contract: BillingContractRow, frequency: BillingFrequency, today: Date): MonthGrid {
  const span = frequency === "quarterly" ? 3 : frequency === "annual" ? 12 : 1;
  const advance = contract.bill_month_in_advance ? 1 : 0;
  const billingDay = Math.min(31, Math.max(1, contract.billing_day_of_month ?? 1));
  const stamped = parseYmd(contract.billing_anchor_date);
  if (stamped) return { span, advance, billingDay, originIdx: monthIndex(stamped.y, stamped.m) };
  const anchor = billingAnchor(contract, today);
  const anchorIdx = monthIndex(anchor.y, anchor.m);
  if (contract.last_billed_date) return { span, advance, billingDay, originIdx: anchorIdx + advance };
  const firstInMonth = clampedBoundary(anchor.y, anchor.m, billingDay);
  return { span, advance, billingDay, originIdx: dayDiff(anchor, firstInMonth) >= 0 ? anchorIdx : anchorIdx + 1 };
}

/**
 * The value to stamp into `billing_anchor_date` when a regular invoice for
 * `plan` is created, or null when nothing should be written (already
 * stamped, or a cadence without a month grid to pin).
 */
export function billingAnchorStamp(contract: BillingContractRow, plan: BillingPlan): string | null {
  if (contract.billing_anchor_date) return null;
  return plan.frequency === "quarterly" || plan.frequency === "annual" ? plan.cycleStart : null;
}

/**
 * Month numbers (1–12) quarterly/annual cycles start in, for display ("Invoices
 * in Jan, Apr, Jul, Oct"). Empty for other cadences.
 */
export function cycleStartMonths(contract: BillingContractRow, today: Date = new Date()): number[] {
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  if (frequency !== "quarterly" && frequency !== "annual") return [];
  const g = monthGrid(contract, frequency, today);
  const out: number[] = [];
  for (let k = 0; k < 12; k += g.span) out.push(((((g.originIdx + k) % 12) + 12) % 12) + 1);
  return out.sort((a, b) => a - b);
}

/** Month index of the cycle window containing month `idx`. */
function windowStartIdx(g: MonthGrid, idx: number): number {
  if (g.span === 1) return idx;
  return g.originIdx + Math.floor((idx - g.originIdx) / g.span) * g.span;
}

/** Billing day (clamped) of month index `idx`. */
function billingDayOf(g: MonthGrid, idx: number): Ymd {
  const { y, m } = fromMonthIndex(idx);
  return clampedBoundary(y, m, g.billingDay);
}

interface MonthTarget {
  /** Month index of the cycle window being billed. */
  windowIdx: number;
  /** Month index whose key prices the invoice and whose billing day dates it (cron). */
  billingMonthIdx: number;
  /**
   * "natural" — the cycle this run month bills (the next month's with
   * "bill 1 month in advance"). "missed_first_cycle" — advance billing only:
   * the cycle in progress, whose advance run (a month earlier) happened
   * before the contract was billable, so no run ever billed it.
   */
  via: "natural" | "missed_first_cycle";
}

/**
 * Which cycle a month-anchored run on `today` bills. Normally the cycle
 * `today`'s run month is responsible for. With "bill 1 month in advance",
 * a contract that became billable after the advance run for the cycle now in
 * progress (e.g. starts Oct 20, bills on the 25th, signed Oct 5 — the Sep 25
 * run that would have billed the Oct 25 cycle predates it) would otherwise
 * never have that cycle billed: the Oct 25 run bills November. That cycle is
 * billed first, as long as it starts on/after the start date and isn't
 * back-dated before the contract became billable.
 */
function resolveMonthTarget(contract: BillingContractRow, g: MonthGrid, today: Date): MonthTarget {
  const now = toYmd(today);
  const nowIdx = monthIndex(now.y, now.m);
  const naturalIdx = nowIdx + g.advance;
  const natural: MonthTarget = { windowIdx: windowStartIdx(g, naturalIdx), billingMonthIdx: naturalIdx, via: "natural" };
  if (!g.advance) return natural;

  // The window in progress today (for quarterly/annual mid-window, the same
  // window the natural target points at, which no run of its own would bill).
  const currentIdx = windowStartIdx(g, nowIdx);
  const last = parseYmd(contract.last_billed_date);
  if (last && monthIndex(last.y, last.m) >= currentIdx) return natural;
  const cycleStart = billingDayOf(g, currentIdx);
  if (contract.start_date && fmt(cycleStart) < contract.start_date) return natural;
  const since = billableSince(contract);
  if (!since) return natural;
  const advanceRun = billingDayOf(g, currentIdx - g.advance);
  if (dayDiff(advanceRun, since) <= 0) return natural; // billable at its run: a missed run, not a gap
  if (!clientActiveBy(contract, cycleStart)) return natural; // client was off service when it began
  return { windowIdx: currentIdx, billingMonthIdx: currentIdx, via: "missed_first_cycle" };
}

/**
 * Whether the daily cron should bill this contract today. Callers still apply
 * their own is_active / auto_generate / status / end_date gates — this
 * answers the cadence question, plus the start rule (a cycle that begins
 * before start_date is never due).
 */
export function isBillingDueOn(contract: BillingContractRow, today: Date): boolean {
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  const now = toYmd(today);

  switch (frequency) {
    case "monthly":
    case "quarterly":
    case "annual": {
      const g = monthGrid(contract, frequency, today);
      const target = resolveMonthTarget(contract, g, today);
      const cycleStart = billingDayOf(g, target.windowIdx);
      // Never bill a cycle that began before the contract did — that is what
      // the first-period stub (prorate mode) or nothing (first full cycle) is for.
      if (contract.start_date && fmt(cycleStart) < contract.start_date) return false;
      if (target.via === "missed_first_cycle") return true;

      // Quarterly/annual fire only in the run months of their grid, and
      // never for a cycle before the grid's first (the anchor is still ahead).
      const nowIdx = monthIndex(now.y, now.m);
      if (g.span > 1) {
        if (target.windowIdx !== target.billingMonthIdx) return false;
        if (target.windowIdx < g.originIdx) return false;
      }

      // The pre-existing day-of-month rule, unchanged: a contract configured
      // for the 31st fires on the 30th (or 28th/29th) in shorter months.
      const dueDay = billingDayOf(g, nowIdx).d;
      if (now.d === dueDay) return true;
      // Catch-up: if the cron missed the billing day (outage, failed run,
      // contract flipped to active late), the exact-day match never fires
      // again and the period was silently never billed. Any later day in the
      // run month is due as long as the period is verifiably unbilled. Safety
      // rails, all required:
      //  - last_billed_date must not already sit in the billed month (the
      //    cron stamps it on every successful run; a manually deleted
      //    invoice therefore is NOT regenerated after the billing day);
      //  - a client reactivated after the billing day is not back-billed for
      //    that cycle (clientActiveBy); an imported contract has its period in
      //    progress marked billed by the import itself;
      //  - callers still run their live-invoice-in-period idempotency query.
      // A contract that simply became billable after the billing day (entered,
      // signed or activated late) IS billed for the cycle — dated the day the
      // invoice is created, not back-dated (see cronInvoiceDate).
      if (now.d < dueDay) return false;
      const last = parseYmd(contract.last_billed_date);
      if (last && monthIndex(last.y, last.m) >= target.billingMonthIdx) return false;
      return clientActiveBy(contract, billingDayOf(g, target.billingMonthIdx));
    }

    case "weekly":
    case "biweekly": {
      const step = frequency === "weekly" ? 7 : 14;
      const anchor = billingAnchor(contract, today);
      const elapsed = dayDiff(anchor, now);
      if (elapsed < 0) return false;
      if (elapsed % step === 0) return true;
      // Catch-up, as for the month-anchored cadences: a run missed on the period's first day
      // (outage, timeout, skipped invocation) never matched again, so that week was silently
      // never billed. Any later day in the same period is due while last_billed_date shows the
      // period unbilled; callers still run their live-invoice-in-period check, and the
      // (contract_id, invoice_date) unique index backstops a race. The invoice is dated the
      // run day, so it is never back-dated.
      const periodStart = addDays(anchor, Math.floor(elapsed / step) * step);
      const last = parseYmd(contract.last_billed_date);
      if (last && dayDiff(periodStart, last) >= 0) return false;
      return true;
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
      cycleStart: fmt(periodStart),
    };
  }

  if (frequency === "one_time") {
    // one_time fires on the first run at or after the anchor, not on a
    // day-of-month, so it dates its single invoice the day it actually runs —
    // otherwise a contract starting on the 10th with billing_day_of_month 1
    // would be invoiced with a date nine days in the past. "Bill month in
    // advance" still labels and dates it in the following month. The window
    // is unbounded: "billed once, ever".
    const advance = contract.bill_month_in_advance ? 1 : 0;
    const bm = fromMonthIndex(monthIndex(now.y, now.m) + advance);
    const invoiceDate = fmt({ y: bm.y, m: bm.m, d: Math.min(now.d, daysInMonth(bm.y, bm.m)) });
    return { frequency, monthKey: MONTH_KEYS[bm.m - 1], invoiceDate, periodStart: null, periodEnd: null, cycleStart: invoiceDate };
  }

  // ── month-anchored: monthly / quarterly / annual ─────────────────────────
  // "Bill month in advance" dates and labels the invoice for next calendar
  // month instead of the current one; the day is clamped to THAT month's
  // length, not today's.
  const g = monthGrid(contract, frequency, today);
  const target = resolveMonthTarget(contract, g, today);
  const bm = fromMonthIndex(target.billingMonthIdx);
  let invoiceDate: string;
  if (!opts.billNow) {
    invoiceDate = cronInvoiceDate(contract, billingDayOf(g, target.billingMonthIdx), now);
  } else if (target.via === "missed_first_cycle") {
    // The cycle in progress: dated today, or on its start if that is still
    // ahead (advance billing dates ahead, and never before the start date).
    const cycleStart = billingDayOf(g, target.windowIdx);
    invoiceDate = fmt(dayDiff(now, cycleStart) > 0 ? cycleStart : now);
  } else {
    invoiceDate = fmt({ y: bm.y, m: bm.m, d: Math.min(now.d, daysInMonth(bm.y, bm.m)) });
  }

  // The window is the calendar month for monthly; for quarterly/annual it is
  // aligned to the anchor's own quarter/year grid, shifted by the same
  // advance offset applied to the invoice date so it always contains it.
  const start = fromMonthIndex(target.windowIdx);
  const end = fromMonthIndex(target.windowIdx + g.span - 1);
  return {
    frequency,
    monthKey: MONTH_KEYS[bm.m - 1],
    invoiceDate,
    periodStart: fmt({ y: start.y, m: start.m, d: 1 }),
    periodEnd: fmt({ y: end.y, m: end.m, d: daysInMonth(end.y, end.m) }),
    cycleStart: fmt(billingDayOf(g, target.windowIdx)),
  };
}

/**
 * The last day covered by what the contract has billed so far (YYYY-MM-DD),
 * or null when it has never billed a regular cycle. Reads `last_billed_date`
 * as the invoice date of the last regular invoice and returns the end of the
 * cycle that invoice paid for: the day before the next cycle starts
 * (monthly/quarterly/annual — a manual invoice dated mid-month counts as
 * that month's cycle), the end of the 7/14-day period (weekly/biweekly). A
 * billed one_time contract covers its whole term: end_date, else open-ended
 * (returned as "9999-12-31"). With no regular cycle billed yet but the
 * prorated first-period stub out, the stub's end.
 *
 * Used to tell whether a visit/storm on a contract that has since been
 * cancelled, expired or paused was already paid for by the contract.
 */
export function contractBilledThrough(
  contract: BillingContractRow & { end_date?: string | null; first_period_prorated_at?: string | null },
  today: Date = new Date(),
): string | null {
  const last = parseYmd(contract.last_billed_date);
  if (!last) {
    // Only the prorated first-period stub has gone out: it covers start_date
    // up to the day before the first regular cycle.
    if (!contract.first_period_prorated_at) return null;
    const first = firstRegularCycle(contract);
    return first ? fmt(addDays(first.start, -1)) : null;
  }
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  switch (frequency) {
    case "one_time":
      return contract.end_date ?? "9999-12-31";
    case "weekly":
    case "biweekly": {
      const step = frequency === "weekly" ? 7 : 14;
      const anchor = billingAnchor(contract, today);
      const periodStart = addDays(anchor, Math.floor(dayDiff(anchor, last) / step) * step);
      return fmt(addDays(periodStart, step - 1));
    }
    default: {
      const g = monthGrid(contract, frequency, today);
      // The cycle whose window holds last_billed_date's month: a cron invoice
      // is dated on the cycle start, a manual one any day of that month
      // (even before the billing day — it is still that month's cycle).
      const w = windowStartIdx(g, monthIndex(last.y, last.m));
      return fmt(addDays(billingDayOf(g, w + g.span), -1));
    }
  }
}

/**
 * The invoice date the cron's most recent scheduled run on or before `today`
 * produced (or would have) for this contract — i.e. the billing date of the
 * period currently in progress (next month's with "bill 1 month in
 * advance"). Null when no run has fallen due yet. Used to seed
 * last_billed_date on imported contracts, which were billed up to now by the
 * system they came from.
 */
export function currentPeriodBillingDate(contract: BillingContractRow, today: Date): string | null {
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  const now = toYmd(today);
  const anchor = billingAnchor(contract, today);
  if (frequency === "one_time") return dayDiff(anchor, now) >= 0 ? fmt(anchor) : null;
  if (frequency === "weekly" || frequency === "biweekly") {
    const step = frequency === "weekly" ? 7 : 14;
    const elapsed = dayDiff(anchor, now);
    return elapsed < 0 ? null : fmt(addDays(anchor, Math.floor(elapsed / step) * step));
  }
  const g = monthGrid(contract, frequency, today);
  const nowIdx = monthIndex(now.y, now.m);
  for (let runIdx = nowIdx; runIdx >= nowIdx - g.span; runIdx -= 1) {
    if (runIdx < monthIndex(anchor.y, anchor.m)) return null;
    if (dayDiff(billingDayOf(g, runIdx), now) < 0) continue; // this month's run is still ahead
    const billedIdx = runIdx + g.advance;
    if (windowStartIdx(g, billedIdx) !== billedIdx) continue; // not a run month of the grid
    return fmt(billingDayOf(g, billedIdx));
  }
  return null;
}

/** The contract columns pendingLateCycle reads on top of the billing ones. */
export interface LateCycleContractRow extends BillingContractRow {
  status?: string | null;
  is_active?: boolean | null;
  auto_generate?: boolean | null;
  end_date?: string | null;
  monthly_amount_cents?: number | null;
  monthly_amounts?: Record<string, number | null> | null;
}

/** A cycle whose billing day has already passed but that the next run would still bill. */
export interface LateCycle {
  frequency: BillingFrequency;
  /** The cycle's window (YYYY-MM-DD, inclusive) — e.g. Jan 1 – Jan 31. */
  periodStart: string;
  periodEnd: string;
  /** The day it would normally have been billed (YYYY-MM-DD). */
  billingDay: string;
  /** First day of the cycle after it (YYYY-MM-DD). */
  nextCycleStart: string;
  /**
   * What to write on the contract to start billing with the NEXT cycle instead:
   * last_billed_date inside this cycle (so the cron and catch-up treat it as
   * billed), plus the quarterly/annual grid pin the billing paths would stamp.
   */
  skipUpdate: { last_billed_date: string; billing_anchor_date?: string };
}

/**
 * The cycle the contract-invoices cron would bill LATE on its next run: the
 * contract was entered, signed or activated after that cycle's billing day, so
 * catch-up bills it dated the run day. The contract dialog asks whether to bill
 * it now or start with the next cycle. Null when nothing is pending — not
 * billable (status / active / auto-generate / term / $0 month), already billed,
 * or today IS the billing day (a normal run, nothing to ask).
 *
 * The cron additionally skips a cycle whose billing day passed while the CLIENT
 * was off service (audit trail); this helper can't see that, so callers that
 * bill on the user's say-so go through Create Invoices, which bills on request.
 */
export function pendingLateCycle(contract: LateCycleContractRow, today: Date): LateCycle | null {
  if (contract.status !== "signed" && contract.status !== "active") return null;
  if (contract.is_active === false || contract.auto_generate === false) return null;
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  if (frequency === "one_time") return null;
  if (!isBillingDueOn(contract, today)) return null;

  const now = toYmd(today);
  let billingDay: Ymd;
  if (frequency === "weekly" || frequency === "biweekly") {
    const step = frequency === "weekly" ? 7 : 14;
    const elapsed = dayDiff(billingAnchor(contract, today), now);
    if (elapsed % step === 0) return null; // today is the period's first day
    billingDay = addDays(now, -(elapsed % step));
  } else {
    const g = monthGrid(contract, frequency, today);
    const runDay = billingDayOf(g, monthIndex(now.y, now.m));
    if (runDay.d === now.d) return null; // today is the billing day
    billingDay = runDay.d < now.d ? runDay : billingDayOf(g, monthIndex(now.y, now.m) - 1);
  }

  const plan = planContractBilling(contract, today, { billNow: false });
  if (!plan.periodStart || !plan.periodEnd) return null;
  if (billedInPeriod(plan, contract.last_billed_date)) return null;
  if (termSkipReason(plan, contract)) return null;
  const override = contract.monthly_amounts?.[plan.monthKey];
  const amount = override ?? contract.monthly_amount_cents ?? 0;
  if (amount <= 0) return null;

  const end = parseYmd(plan.periodEnd)!;
  const anchorStamp = billingAnchorStamp(contract, plan);
  return {
    frequency,
    periodStart: plan.periodStart,
    periodEnd: plan.periodEnd,
    billingDay: fmt(billingDay),
    nextCycleStart: fmt(addDays(end, 1)),
    skipUpdate: {
      last_billed_date: plan.periodEnd,
      ...(anchorStamp ? { billing_anchor_date: anchorStamp } : {}),
    },
  };
}

/** The contract columns contractCoversServiceDay reads. */
export interface CoverageContractRow extends BillingContractRow {
  status?: string | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
  end_date?: string | null;
  first_period_prorated_at?: string | null;
}

/**
 * Whether the contract price already pays for service performed on `day`
 * (YYYY-MM-DD), so the visit must NOT also be billed per visit.
 *
 *  - Before start_date: never covered — the contract hadn't started (bill per visit).
 *  - A contract still in force (draft/sent included: it may yet be signed, and
 *    billing the visit now would double-bill once it is) covers its term up
 *    to end_date, and past it through the last cycle it billed in full.
 *  - A cancelled / expired / paused (is_active off) contract covers only
 *    days inside a cycle it actually billed (contractBilledThrough) — the
 *    cron has stopped, so anything later is billed per visit.
 *  - A deleted contract covers nothing.
 *
 * `outsideDatesIncluded` (snow's "storms outside the contract dates:
 * included") lifts the start/end-date limits for a contract in force.
 */
export function contractCoversServiceDay(
  contract: CoverageContractRow,
  day: string,
  opts: { outsideDatesIncluded?: boolean; today?: Date } = {},
): boolean {
  if (contract.deleted_at != null) return false;
  if (!opts.outsideDatesIncluded && contract.start_date && day < contract.start_date) return false;
  const inForce = contract.is_active !== false && contract.status !== "cancelled" && contract.status !== "expired";
  if (inForce && (opts.outsideDatesIncluded || !contract.end_date || day <= contract.end_date)) return true;
  const through = contractBilledThrough(contract, opts.today ?? new Date());
  return through != null && day <= through;
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

/**
 * Why a plan falls outside the contract's term, or null when it may bill.
 *
 * The term is tested against the CYCLE being billed, not today. With "bill
 * month in advance" on, the run in September bills October: a contract
 * starting Oct 1 must have its October cycle billed in September, and one
 * ending Dec 31 must not bill in December for January.
 *
 *  - Start: nothing is dated before start_date, and no invoice pays for a
 *    cycle that BEGINS before it (a contract starting Jan 15 that bills on
 *    the 1st is not invoiced for the Jan 1 cycle; its first invoice is the
 *    Feb 1 cycle, or a prorated Jan 15–31 stub first in prorate mode).
 *  - End: the last cycle that starts on or before end_date is billed in full;
 *    a cycle starting after it is not.
 *
 * `one_time` has no period window, so its single invoice date stands in.
 */
export function termSkipReason(
  plan: BillingPlan,
  contract: { start_date?: string | null; end_date?: string | null },
): string | null {
  const windowEnd = plan.periodEnd ?? plan.invoiceDate;
  if (contract.start_date) {
    if (contract.start_date > windowEnd || plan.invoiceDate < contract.start_date) return "contract hasn't started yet";
    if (plan.cycleStart < contract.start_date) {
      return `the billing cycle starting ${plan.cycleStart} begins before the contract's start date (${contract.start_date})`;
    }
  }
  if (contract.end_date && contract.end_date < plan.cycleStart) {
    const windowStart = plan.periodStart ?? plan.invoiceDate;
    return contract.end_date < windowStart
      ? "contract has ended"
      : `contract ends (${contract.end_date}) before the billing cycle starting ${plan.cycleStart}`;
  }
  return null;
}

// ── first-period proration ─────────────────────────────────────────────────────

/** `crm_contracts.start_billing_mode`: how a contract that starts mid-cycle bills its first stub. */
export type StartBillingMode = "first_full_cycle" | "prorate_first_period";

export function normalizeStartBillingMode(raw: string | null | undefined): StartBillingMode {
  return raw === "prorate_first_period" ? "prorate_first_period" : "first_full_cycle";
}

export interface ProrationContractRow extends BillingContractRow {
  start_billing_mode?: string | null;
  first_period_prorated_at?: string | null;
  monthly_amount_cents?: number | null;
  monthly_amounts?: Record<string, number | null> | null;
}

export interface ProrationPlan {
  /** Stub period, inclusive, YYYY-MM-DD. */
  periodStart: string;
  periodEnd: string;
  stubDays: number;
  /** Length in days of the full billing cycle the stub is a slice of. */
  cycleDays: number;
  /** Full-cycle amount the stub is a fraction of. */
  periodAmountCents: number;
  /** Prorated amount, rounded to whole cents. */
  amountCents: number;
  /** Invoice line "name". */
  label: string;
  /** Invoice line "description" — shows the formula. */
  formula: string;
  /** The first regular cycle's start (the day after periodEnd), YYYY-MM-DD. */
  firstRegularCycleStart: string;
}

/**
 * Daily proration of a billing cycle: `periodCents × stubDays ÷ cycleDays`,
 * rounded to the nearest cent. The one place this formula lives.
 */
export function prorateCents(periodCents: number, stubDays: number, cycleDays: number): number {
  if (cycleDays <= 0 || stubDays <= 0) return 0;
  return Math.round((periodCents * Math.min(stubDays, cycleDays)) / cycleDays);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtShort(p: Ymd): string {
  return `${MONTH_ABBR[p.m - 1]} ${p.d}, ${p.y}`;
}

function fmtMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Billing day clamped to the length of month (y, m). */
function clampedBoundary(y: number, m: number, billingDay: number): Ymd {
  return { y, m, d: Math.min(billingDay, daysInMonth(y, m)) };
}

/**
 * The first regular billing cycle of a month-anchored contract: the first
 * cycle on the contract's grid (see termSkipReason / isBillingDueOn) that
 * starts on or after `start_date`, and the cycle start before it. Null for
 * weekly/biweekly/one_time or without a start date.
 */
function firstRegularCycle(contract: BillingContractRow): { start: Ymd; prev: Ymd } | null {
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  if (frequency !== "monthly" && frequency !== "quarterly" && frequency !== "annual") return null;
  const start = parseYmd(contract.start_date);
  if (!start) return null;
  const g = monthGrid(contract, frequency, new Date(start.y, start.m - 1, start.d));
  let w = windowStartIdx(g, monthIndex(start.y, start.m));
  while (dayDiff(start, billingDayOf(g, w)) < 0) w += g.span;
  return { start: billingDayOf(g, w), prev: billingDayOf(g, w - g.span) };
}

/**
 * The prorated first-period stub for a contract that starts mid-cycle, or null
 * when the contract isn't set to prorate, starts exactly on a cycle start, or
 * its cadence has no meaningful stub (weekly/biweekly/one_time).
 *
 * Pure — depends only on the contract row, never on "today". The cycle grid is
 * the one isBillingDueOn bills on: a cycle runs from one billing day to the
 * day before the next; monthly cycles start every month, quarterly/annual
 * cycles every 3/12 months from the first billing day on/after the start
 * date (monthGrid). The stub is the days from the start date up to the day
 * before the FIRST regular cycle (regular billing never bills a cycle that
 * began before the start date), so the two together cover the term with no
 * gap and no overlap:
 *   - start after that month's billing day (Oct 20, day 1): stub Oct 20–Oct 31,
 *     first regular cycle Nov 1 (monthly, quarterly and annual alike).
 *   - start before it (Oct 20, day 25): stub Oct 20–Oct 24 of the cycle ending
 *     Oct 24, first regular cycle Oct 25.
 * A contract already billing on an older grid keeps it (billing_anchor_date /
 * last_billed_date), and the stub is measured against that grid.
 */
export function planFirstPeriodProration(contract: ProrationContractRow): ProrationPlan | null {
  if (normalizeStartBillingMode(contract.start_billing_mode) !== "prorate_first_period") return null;
  const start = parseYmd(contract.start_date);
  const first = firstRegularCycle(contract);
  if (!start || !first) return null;

  const stubDays = dayDiff(start, first.start);
  const cycleDays = dayDiff(first.prev, first.start);
  if (stubDays <= 0 || cycleDays <= 0) return null; // starts exactly on a cycle start

  const key = MONTH_KEYS[start.m - 1];
  const override = contract.monthly_amounts?.[key];
  const periodAmountCents = Math.round(override != null ? override : (contract.monthly_amount_cents ?? 0));
  if (periodAmountCents <= 0) return null;

  const periodEnd = addDays(first.start, -1);
  const amountCents = prorateCents(periodAmountCents, stubDays, cycleDays);
  if (amountCents <= 0) return null;
  return {
    periodStart: fmt(start),
    periodEnd: fmt(periodEnd),
    stubDays,
    cycleDays,
    periodAmountCents,
    amountCents,
    label: `Prorated first period (${fmtShort(start)} – ${fmtShort(periodEnd)})`,
    formula: `${fmtMoney(periodAmountCents)} × ${stubDays}/${cycleDays} days = ${fmtMoney(amountCents)}`,
    firstRegularCycleStart: fmt(first.start),
  };
}

/**
 * Whether the stub still needs billing: prorate mode, never stubbed, and the
 * contract hasn't already begun regular billing (last_billed_date set means a
 * full cycle already went out — turning proration on later must not retro-bill
 * a stub for a contract that is already running).
 *
 * Exception: with "bill 1 month in advance" the FIRST regular cycle is
 * invoiced a month before it starts — usually before the start date, when
 * the stub isn't due yet — so last_billed_date sitting in that first cycle's
 * month doesn't mean the contract was already running. Pass the stub so that
 * case is recognised.
 */
export function prorationPending(
  contract: ProrationContractRow,
  hasLiveProratedInvoice: boolean,
  stub?: ProrationPlan | null,
): boolean {
  if (contract.first_period_prorated_at || hasLiveProratedInvoice) return false;
  const last = parseYmd(contract.last_billed_date);
  if (!last) return true;
  if (!contract.bill_month_in_advance || !stub) return false;
  const first = parseYmd(stub.firstRegularCycleStart);
  return !!first && monthIndex(last.y, last.m) <= monthIndex(first.y, first.m);
}
