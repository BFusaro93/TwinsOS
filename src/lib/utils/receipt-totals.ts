import { computeSalesTax } from "@/lib/utils/po-tax";

/** Receipt totals math shared by the create path (ReceiveGoodsDialog) and the
 *  edit path (useUpdateGoodsReceipt), so correcting a receipt preserves the
 *  same discount / shipping / tax / final-receipt true-up logic.
 *
 *  All amounts are whole cents.
 */
export interface ReceiptTotalsPo {
  /** PO ordered subtotal (cents), the denominator for proration. */
  subtotal: number;
  discountCost: number;
  discountReducesTax: boolean;
  shippingCost: number;
  taxRatePercent: number;
  salesTax: number;
  grandTotal: number;
}

export interface ReceiptTotalsPrior {
  salesTax: number;
  shippingCost: number;
  grandTotal: number;
}

export interface ReceiptTotals {
  subtotal: number;
  discount: number;
  salesTax: number;
  shippingCost: number;
  grandTotal: number;
}

export function computeReceiptTotals({
  subtotal,
  taxableSubtotal,
  po,
  priorReceipts,
  isFinalReceipt,
}: {
  /** This receipt's received subtotal (cents). */
  subtotal: number;
  /** Taxable portion of this receipt's subtotal (cents). */
  taxableSubtotal: number;
  po: ReceiptTotalsPo;
  /** Every OTHER live receipt on the same PO. */
  priorReceipts: ReceiptTotalsPrior[];
  /** True when this receipt brings every PO line to its full ordered quantity. */
  isFinalReceipt: boolean;
}): ReceiptTotals {
  // PO-level discount and shipping are whole-order amounts; prorate by this
  // receipt's share of the PO's ordered subtotal.
  const discountShare = po.discountCost > 0 && po.subtotal > 0
    ? Math.round(po.discountCost * (subtotal / po.subtotal))
    : 0;
  const shippingShare = po.shippingCost > 0 && po.subtotal > 0
    ? Math.round(po.shippingCost * (subtotal / po.subtotal))
    : 0;
  const proratedTax = computeSalesTax({
    taxableSubtotal,
    taxRatePercent: po.taxRatePercent,
    discountCost: discountShare,
    discountReducesTax: po.discountReducesTax,
  });

  // The receipt that completes the PO takes whatever remains of the PO's
  // totals so the receipts sum to exactly what the vendor is owed.
  const remainingTax = po.salesTax - priorReceipts.reduce((s, r) => s + r.salesTax, 0);
  const remainingShipping = po.shippingCost - priorReceipts.reduce((s, r) => s + r.shippingCost, 0);
  const remainingTotal = po.grandTotal - priorReceipts.reduce((s, r) => s + r.grandTotal, 0);
  const remainingDiscount = subtotal + remainingTax + remainingShipping - remainingTotal;
  // Older receipts recorded full shipping each time, so a remainder can come
  // out negative — keep the prorated figures rather than record nonsense.
  const trueUp =
    isFinalReceipt && priorReceipts.length > 0 &&
    remainingTax >= 0 && remainingShipping >= 0 && remainingDiscount >= 0;

  const salesTax = trueUp ? remainingTax : proratedTax;
  const shippingCost = trueUp ? remainingShipping : shippingShare;
  const discount = trueUp ? remainingDiscount : discountShare;
  return {
    subtotal,
    discount,
    salesTax,
    shippingCost,
    grandTotal: subtotal - discount + salesTax + shippingCost,
  };
}
