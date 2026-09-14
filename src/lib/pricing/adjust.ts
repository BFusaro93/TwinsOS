// Shared price-adjustment maths for the two bulk-pricing features:
//  - the catalog bulk adjust dialogs (services, rate matrix), and
//  - price adjustment runs, which re-price live client work.
//
// Everything here is cents-in / cents-out. Percentages are whole percents
// (5 => +5%, -3 => -3%) to match what the existing PO BulkPriceUpdateDialog
// already asks the user for.

export type AdjustMethod = "percent" | "flat";

/**
 * Landscaping quotes get rounded to human numbers — nobody bills $47.83 for a
 * mow. `cent` is the no-op that still strips sub-cent drift from a percentage.
 */
export type RoundingRule = "cent" | "quarter" | "dollar" | "five";

export const ROUNDING_LABELS: Record<RoundingRule, string> = {
  cent: "Exact cent",
  quarter: "Nearest $0.25",
  dollar: "Nearest $1",
  five: "Nearest $5",
};

const ROUNDING_STEP_CENTS: Record<RoundingRule, number> = {
  cent: 1,
  quarter: 25,
  dollar: 100,
  five: 500,
};

export interface AdjustOptions {
  method: AdjustMethod;
  /** Whole percent when method is "percent"; cents when method is "flat". */
  amount: number;
  rounding: RoundingRule;
  /** Never price below this (cents). Defaults to 0 — negative prices are never valid. */
  floorCents?: number;
  /** Never price above this (cents) when set. */
  ceilingCents?: number;
}

/**
 * Half away from zero, matching PostgreSQL's `round()` on numeric — which is
 * what crm_adjust_price_cents() uses. JS `Math.round` breaks ties toward
 * +Infinity instead, so the two disagree on negative halves.
 */
function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function roundCents(cents: number, rounding: RoundingRule): number {
  const step = ROUNDING_STEP_CENTS[rounding];
  // Sub-microcent float noise would otherwise decide a tie the wrong way; the
  // DB does this arithmetic in exact numeric and never sees it.
  const snapped = Number((cents / step).toFixed(6));
  return roundHalfAwayFromZero(snapped) * step;
}

/**
 * Returns the adjusted price in cents.
 *
 * A percentage adjustment on 0 stays 0 — scaling nothing gives nothing, and
 * silently turning an unpriced catalog row into a priced one during a bulk run
 * is the kind of surprise that ends up on an invoice. Use a flat adjustment to
 * put a price on something that has none.
 */
export function adjustCents(cents: number, opts: AdjustOptions): number {
  const { method, amount, rounding, floorCents = 0, ceilingCents } = opts;

  let next: number;
  if (method === "percent") {
    if (cents === 0) return 0;
    // (cents * (100 + amount)) / 100, NOT cents * (1 + amount / 100): the
    // latter goes through an inexact binary fraction and lands just under a
    // rounding tie, so $30.00 +15% came out $34.00 here while the DB's exact
    // numeric arithmetic gave $35.00. Multiplying first keeps whole-percent
    // cases exact.
    next = (cents * (100 + amount)) / 100;
  } else {
    next = cents + amount;
  }

  next = roundCents(next, rounding);
  if (next < floorCents) next = floorCents;
  if (ceilingCents != null && next > ceilingCents) next = ceilingCents;
  return next;
}

/** Parses a dollars-and-cents user string ("12.50", "$12.50", "") into cents. */
export function parseDollarsToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (cleaned === "" || cleaned === "-") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}
