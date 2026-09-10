/** Sales-tax math shared by the PO and Requisition surfaces.
 *
 *  Two rules exist because vendors differ: most tax the full amount and credit
 *  a discount afterward, while some (RockAuto, for one) discount the order
 *  first and tax what's left. `discountReducesTax` on the PO/requisition picks
 *  which one applies; it defaults to false, the post-tax rule.
 *
 *  All amounts are whole cents, matching the integer columns these values are
 *  written back to.
 */
export function computeSalesTax({
  taxableSubtotal,
  taxRatePercent,
  discountCost,
  discountReducesTax,
}: {
  /** Subtotal of the taxable lines only — PO lines carry a `taxable` flag;
   *  requisition lines are always taxable, so pass the whole subtotal there. */
  taxableSubtotal: number;
  taxRatePercent: number;
  discountCost: number;
  discountReducesTax: boolean;
}): number {
  const base = discountReducesTax
    ? Math.max(0, taxableSubtotal - discountCost)
    : taxableSubtotal;
  return Math.round((base * taxRatePercent) / 100);
}
