/** Sales-tax math shared by the PO and Requisition surfaces.
 *
 *  Two rules exist because vendors differ: most tax the full amount and credit
 *  a discount afterward, while some (RockAuto, for one) discount the order
 *  first and tax what's left. `discountReducesTax` on the PO/requisition picks
 *  which one applies; it defaults to false, the post-tax rule.
 *
 *  When the discount comes off before tax, it is spread across the taxable and
 *  non-taxable lines by their share of the subtotal, and only the taxable
 *  share reduces the taxable base. (Taking the whole discount off the taxable
 *  lines under-taxed a PO whose discount was really on its non-taxable lines.)
 *
 *  The database recomputes the stored PO/requisition totals with the same rule
 *  (procurement_totals(), 20261229000400) — keep the two in step.
 *
 *  All amounts are whole cents, matching the integer columns these values are
 *  written back to.
 */
export function computeSalesTax({
  taxableSubtotal,
  subtotal,
  taxRatePercent,
  discountCost,
  discountReducesTax,
}: {
  /** Subtotal of the taxable lines only — PO lines carry a `taxable` flag;
   *  requisition lines are always taxable, so pass the whole subtotal there. */
  taxableSubtotal: number;
  /** Subtotal of every line, taxable or not (the base the discount is spread over). */
  subtotal: number;
  taxRatePercent: number;
  discountCost: number;
  discountReducesTax: boolean;
}): number {
  const base = discountReducesTax
    ? Math.max(0, taxableSubtotal - taxableDiscountShare({ taxableSubtotal, subtotal, discountCost: effectiveDiscount(discountCost, subtotal) }))
    : taxableSubtotal;
  return Math.round((base * taxRatePercent) / 100);
}

/** The part of a whole-order discount that falls on the taxable lines: the
 *  discount times the taxable lines' share of the subtotal, in whole cents. */
export function taxableDiscountShare({
  taxableSubtotal,
  subtotal,
  discountCost,
}: {
  taxableSubtotal: number;
  subtotal: number;
  discountCost: number;
}): number {
  if (!discountCost || subtotal <= 0 || taxableSubtotal <= 0) return 0;
  return Math.round((discountCost * taxableSubtotal) / subtotal);
}

/** The discount that actually applies: a discount can take the order down to
 *  zero, never below it (and a negative value is ignored). Mirrors the clamp in
 *  procurement_totals() (20270103000210). Use it wherever a grand total is
 *  worked out as subtotal - discount + tax + shipping. */
export function effectiveDiscount(discountCost: number, subtotal: number): number {
  return Math.min(Math.max(discountCost || 0, 0), Math.max(subtotal, 0));
}
