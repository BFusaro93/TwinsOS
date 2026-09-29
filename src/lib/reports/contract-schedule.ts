import type { BillingFrequency } from "@/types/crm-invoices";
import {
  MONTH_KEYS,
  billingAnchor,
  isBillingDueOn,
  normalizeBillingFrequency,
  planContractBilling,
  termSkipReason,
  type BillingContractRow,
  type MonthKey,
} from "@/lib/contract-billing";

/**
 * Report-side view of a contract's billing schedule, built on the same
 * cadence math the billing paths use (src/lib/contract-billing.ts).
 *
 * `monthly_amount_cents` (and each `monthly_amounts` override) is the
 * PER-INVOICE amount at every billing_frequency — an annual contract stores
 * its full yearly price. Reports that summed it as "per month" overstated a
 * quarterly contract 3x and an annual one 12x, and understated weekly ones.
 */

/** Contract statuses the billing paths will invoice (cron + manual Create Invoices). */
export const BILLABLE_CONTRACT_STATUSES = ["signed", "active"];

/** Invoices a contract generates per year at its frequency. one_time is not recurring. */
export function invoicesPerYear(frequency: BillingFrequency): number {
  switch (frequency) {
    case "weekly":
      return 52;
    case "biweekly":
      return 26;
    case "monthly":
      return 12;
    case "quarterly":
      return 4;
    case "annual":
      return 1;
    case "one_time":
      return 0;
  }
}

/** Monthly-recurring equivalent of a per-invoice amount (cents, rounded). */
export function monthlyRecurringCents(
  perInvoiceCents: number,
  frequency: string | null | undefined
): number {
  return Math.round((perInvoiceCents * invoicesPerYear(normalizeBillingFrequency(frequency))) / 12);
}

export interface ContractScheduleRow extends BillingContractRow {
  end_date?: string | null;
  monthly_amount_cents?: number | null;
  monthly_amounts?: Record<string, number> | null;
}

export interface ScheduledInvoice {
  /** The day the cron would run the billing (YYYY-MM-DD). */
  runDate: string;
  /** invoice_date stamped on the generated invoice (advance-shifted). */
  invoiceDate: string;
  monthKey: MonthKey;
  amountCents: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymdString(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function parse(value: string): { y: number; m: number; d: number } {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function amountFor(contract: ContractScheduleRow, key: MonthKey): number {
  const override = contract.monthly_amounts?.[key];
  return override != null ? override : contract.monthly_amount_cents ?? 0;
}

/**
 * Every invoice the contract's schedule produces with a run date inside
 * [from, to] (YYYY-MM-DD, inclusive), honouring the contract term the same
 * way the cron does (termSkipReason against the billed period) and skipping
 * zero-amount months as the cron does. Candidate run dates are generated per
 * frequency and confirmed with isBillingDueOn, so the cadence can't drift
 * from the billing paths.
 */
export function scheduledContractInvoices(
  contract: ContractScheduleRow,
  from: string,
  to: string
): ScheduledInvoice[] {
  if (from > to) return [];
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  const start = parse(from);
  const end = parse(to);
  const candidates: Date[] = [];

  if (frequency === "weekly" || frequency === "biweekly") {
    const step = frequency === "weekly" ? 7 : 14;
    const anchor = billingAnchor(contract, new Date(start.y, start.m - 1, start.d));
    const anchorUtc = Date.UTC(anchor.y, anchor.m - 1, anchor.d);
    const fromUtc = Date.UTC(start.y, start.m - 1, start.d);
    const toUtc = Date.UTC(end.y, end.m - 1, end.d);
    const firstK = Math.max(0, Math.ceil((fromUtc - anchorUtc) / (step * 86_400_000)));
    for (let k = firstK; ; k += 1) {
      const t = anchorUtc + k * step * 86_400_000;
      if (t > toUtc) break;
      const d = new Date(t);
      candidates.push(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    }
  } else if (frequency === "one_time") {
    const anchor = billingAnchor(contract, new Date(start.y, start.m - 1, start.d));
    const anchorStr = ymdString(anchor.y, anchor.m, anchor.d);
    if (anchorStr >= from && anchorStr <= to) {
      candidates.push(new Date(anchor.y, anchor.m - 1, anchor.d));
    }
  } else {
    // monthly / quarterly / annual: one candidate per calendar month, on the
    // configured day clamped to the month's length.
    for (let idx = start.y * 12 + (start.m - 1); idx <= end.y * 12 + (end.m - 1); idx += 1) {
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const day = Math.min(contract.billing_day_of_month ?? 1, daysInMonth(y, m));
      const str = ymdString(y, m, day);
      if (str < from || str > to) continue;
      candidates.push(new Date(y, m - 1, day));
    }
  }

  const out: ScheduledInvoice[] = [];
  for (const date of candidates) {
    if (!isBillingDueOn(contract, date)) continue;
    const plan = planContractBilling(contract, date, { billNow: false });
    if (termSkipReason(plan, contract)) continue;
    const amountCents = amountFor(contract, plan.monthKey);
    if (amountCents <= 0) continue;
    out.push({
      runDate: ymdString(date.getFullYear(), date.getMonth() + 1, date.getDate()),
      invoiceDate: plan.invoiceDate,
      monthKey: plan.monthKey,
      amountCents,
    });
  }
  return out;
}

/**
 * A contract's typical 12-month billing profile by month key, ignoring its
 * term: which months it invoices and how much. Monthly bills every month;
 * quarterly/annual only in the months on the anchor's grid (shifted by
 * bill_month_in_advance, matching planContractBilling's month key); weekly/
 * biweekly sums each month's runs in `year`; one_time is its single invoice.
 */
export function annualBillingProfile(
  contract: ContractScheduleRow,
  year: number
): Record<MonthKey, number> {
  const profile = Object.fromEntries(MONTH_KEYS.map((k) => [k, 0])) as Record<MonthKey, number>;
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  const anchor = billingAnchor(contract, new Date(year, 0, 1));
  const advance = contract.bill_month_in_advance ? 1 : 0;

  if (frequency === "weekly" || frequency === "biweekly") {
    const step = (frequency === "weekly" ? 7 : 14) * 86_400_000;
    const anchorUtc = Date.UTC(anchor.y, anchor.m - 1, anchor.d);
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year, 11, 31);
    // Periodic cadence: step back from the anchor too, so a contract anchored
    // mid-year still shows a full year's profile.
    let t = anchorUtc + Math.ceil((yearStart - anchorUtc) / step) * step;
    for (; t <= yearEnd; t += step) {
      const key = MONTH_KEYS[new Date(t).getUTCMonth()];
      profile[key] += amountFor(contract, key);
    }
    return profile;
  }

  if (frequency === "monthly") {
    for (const key of MONTH_KEYS) profile[key] = amountFor(contract, key);
    return profile;
  }

  const anchorMonth = anchor.m - 1 + advance;
  if (frequency === "one_time") {
    const key = MONTH_KEYS[anchorMonth % 12];
    profile[key] = amountFor(contract, key);
    return profile;
  }

  const span = frequency === "quarterly" ? 3 : 12;
  for (let k = 0; k < 12 / span; k += 1) {
    const key = MONTH_KEYS[(anchorMonth + k * span) % 12];
    profile[key] = amountFor(contract, key);
  }
  return profile;
}
