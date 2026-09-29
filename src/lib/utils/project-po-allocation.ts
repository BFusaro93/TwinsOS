/** Per-line allocation of PO-level charges to a project.
 *
 *  A project only owns some of a PO's lines, so the PO's shipping, discount
 *  and (discount-adjusted) tax are allocated to a project line by its share of
 *  the PO. Shared by the projects list (use-projects) and the project detail
 *  panel so both always agree. All amounts are whole cents.
 */
export interface PoAllocationContext {
  /** Sum of every line's total on the PO. */
  poSubtotal: number;
  /** Sum of the taxable lines' totals on the PO. */
  poTaxableSubtotal: number;
  taxRatePercent: number;
  shippingCost: number;
  discountCost: number;
  discountReducesTax: boolean;
}

export function allocatePoLine(
  lineTotal: number,
  taxable: boolean,
  ctx: PoAllocationContext
): { tax: number; shipping: number; discount: number } {
  const share = ctx.poSubtotal > 0 ? lineTotal / ctx.poSubtotal : 0;
  const shipping = Math.round(share * (ctx.shippingCost || 0));
  const discount = Math.round(share * (ctx.discountCost || 0));
  if (!taxable) return { tax: 0, shipping, discount };
  // When the PO discounts before tax, the discount shrinks the taxable base
  // for the whole PO (matching computeSalesTax); a taxable line carries its
  // proportional part of that reduction.
  const factor =
    ctx.discountReducesTax && ctx.poTaxableSubtotal > 0
      ? Math.max(0, ctx.poTaxableSubtotal - (ctx.discountCost || 0)) / ctx.poTaxableSubtotal
      : 1;
  const tax = Math.round((lineTotal * ctx.taxRatePercent * factor) / 100);
  return { tax, shipping, discount };
}
