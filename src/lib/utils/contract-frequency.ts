import { formatCurrency } from "@/lib/utils";
import {
  MONTH_KEYS,
  cycleStartMonths,
  normalizeBillingFrequency,
  type BillingContractRow,
  type MonthKey,
} from "@/lib/contract-billing";
import { invoicesPerYear } from "@/lib/reports/contract-schedule";
import type { BillingFrequency } from "@/types/crm-invoices";

/**
 * Display helpers for `crm_contracts.billing_frequency`. The schedule math
 * itself lives in src/lib/contract-billing.ts; this only labels it.
 *
 * `monthly_amount_cents` is the PER-INVOICE amount at every frequency, so a
 * quarterly contract storing 300000 reads "$3,000.00 / quarter".
 */

/** In the order the select shows them; values match the DB CHECK on crm_contracts.billing_frequency. */
export const BILLING_FREQUENCY_OPTIONS: { value: BillingFrequency; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annual", label: "Annual" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "one_time", label: "One time" },
];

export function billingFrequencyLabel(raw: string | null | undefined): string {
  const frequency = normalizeBillingFrequency(raw);
  return BILLING_FREQUENCY_OPTIONS.find((o) => o.value === frequency)?.label ?? "Monthly";
}

const PER_UNIT: Record<BillingFrequency, string> = {
  weekly: "week",
  biweekly: "2 weeks",
  monthly: "month",
  quarterly: "quarter",
  annual: "year",
  one_time: "",
};

/** "/ quarter", "/ month", "one time" — what follows the per-invoice amount. */
export function billingFrequencySuffix(raw: string | null | undefined): string {
  const frequency = normalizeBillingFrequency(raw);
  return frequency === "one_time" ? "one time" : `/ ${PER_UNIT[frequency]}`;
}

/** "$3,000.00 / quarter", "$250.00 / month", "$1,200.00 one time". */
export function formatContractAmount(cents: number, raw: string | null | undefined): string {
  return `${formatCurrency(cents)} ${billingFrequencySuffix(raw)}`;
}

export interface ContractAmountSummary {
  /** "$250.00 / month", "$500.00 / month · 8 months", "$4,100.00 / yr · 8 months (varies)", "$3,000.00 / quarter". */
  label: string;
  /** The amount on every invoice, or null when a monthly grid bills different amounts in different months. */
  perInvoiceCents: number | null;
  /** What the contract bills in a year; null for one-time contracts, which don't recur. */
  yearlyCents: number | null;
  /** Nothing would ever be invoiced (every month $0, or a $0 amount). */
  isZero: boolean;
}

/**
 * One line describing what a contract bills. A monthly contract bills
 * `monthly_amounts[month] ?? monthly_amount_cents` each month and skips a $0
 * month, so its stored monthly_amount_cents is only the AVERAGE of the billed
 * months when they differ — showing that as "/ month" would name an amount no
 * invoice carries. Uneven grids read as a yearly total instead.
 */
export function summarizeContractAmount(contract: {
  monthlyAmountCents: number;
  billingFrequency: string | null | undefined;
  monthlyAmounts?: Partial<Record<MonthKey, number | null>> | null;
}): ContractAmountSummary {
  const frequency = normalizeBillingFrequency(contract.billingFrequency);
  const flat = contract.monthlyAmountCents ?? 0;

  if (frequency !== "monthly") {
    const perYear = invoicesPerYear(frequency);
    return {
      label: formatContractAmount(flat, frequency),
      perInvoiceCents: flat,
      yearlyCents: frequency === "one_time" ? null : flat * perYear,
      isZero: flat <= 0,
    };
  }

  const amounts = contract.monthlyAmounts ?? {};
  const billed = MONTH_KEYS.map((k) => amounts[k] ?? flat).filter((v) => v > 0);
  const yearly = billed.reduce((sum, v) => sum + v, 0);
  const months = `${billed.length} month${billed.length === 1 ? "" : "s"}`;
  if (billed.length === 0) {
    return { label: formatContractAmount(0, frequency), perInvoiceCents: 0, yearlyCents: 0, isZero: true };
  }
  if (new Set(billed).size > 1) {
    return { label: `${formatCurrency(yearly)} / yr · ${months} (varies)`, perInvoiceCents: null, yearlyCents: yearly, isZero: false };
  }
  return {
    label: billed.length === 12 ? formatContractAmount(billed[0], frequency) : `${formatContractAmount(billed[0], frequency)} · ${months}`,
    perInvoiceCents: billed[0],
    yearlyCents: yearly,
    isZero: false,
  };
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The calendar months a quarterly/annual contract invoices in, as month keys in
 * calendar order: the months its cycles start in (contract-billing.ts
 * cycleStartMonths — the first billing day on/after the start date, or the
 * grid it has already been billing on). Each invoice is dated on its cycle's
 * start ("bill 1 month in advance" creates it a month earlier). Empty for any
 * other frequency.
 */
export function contractBillingMonths(contract: BillingContractRow, today: Date = new Date()): MonthKey[] {
  return cycleStartMonths(contract, today).map((m) => MONTH_KEYS[m - 1]);
}

/** "Jan, Apr, Jul, Oct" */
export function formatBillingMonths(months: MonthKey[]): string {
  return months.map((m) => MONTH_ABBR[MONTH_KEYS.indexOf(m)]).join(", ");
}
