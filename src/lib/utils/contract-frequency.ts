import { formatCurrency } from "@/lib/utils";
import {
  MONTH_KEYS,
  billingAnchor,
  normalizeBillingFrequency,
  type BillingContractRow,
  type MonthKey,
} from "@/lib/contract-billing";
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

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The calendar months a quarterly/annual contract invoices in, as month keys in
 * calendar order. Mirrors contract-billing.ts: the cadence runs from the
 * anchor's month (start date → signed → created), and "bill 1 month in
 * advance" dates each invoice in the following month. Empty for any other
 * frequency.
 */
export function contractBillingMonths(contract: BillingContractRow, today: Date = new Date()): MonthKey[] {
  const frequency = normalizeBillingFrequency(contract.billing_frequency);
  if (frequency !== "quarterly" && frequency !== "annual") return [];
  const span = frequency === "quarterly" ? 3 : 12;
  const first = billingAnchor(contract, today).m - 1 + (contract.bill_month_in_advance ? 1 : 0);
  const indexes = new Set<number>();
  for (let k = 0; k < 12; k += span) indexes.add((first + k) % 12);
  return [...indexes].sort((a, b) => a - b).map((i) => MONTH_KEYS[i]);
}

/** "Jan, Apr, Jul, Oct" */
export function formatBillingMonths(months: MonthKey[]): string {
  return months.map((m) => MONTH_ABBR[MONTH_KEYS.indexOf(m)]).join(", ");
}
