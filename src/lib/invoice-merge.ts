// Shared merge-total computation used by both the merge API route
// (src/app/api/crm/invoices/merge/route.ts) and the merge preview dialog
// (src/components/crm/invoices/MergeInvoicesDialog.tsx). The dialog used to
// naively sum each invoice's own totalCents for its preview, which disagrees
// with the server whenever merged invoices have different tax rates or
// discount types — the server recomputes from scratch (net line items,
// combined discounts, tax at the PARENT's rate only). Extracting the exact
// formula here keeps the preview and the actual write in lockstep.

export interface MergeLineItemInput {
  totalCents: number;
  discountCents: number | null;
  isTaxable: boolean;
}

export interface MergeInvoiceInput {
  discountCents: number | null;
  amountPaidCents: number | null;
}

export interface MergedInvoiceTotals {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  amountPaidCents: number;
  balanceCents: number;
}

/**
 * Recomputes the merged invoice's totals from the union of all merged
 * invoices' line items, combining every invoice's own document-level
 * discount and applying only the PARENT invoice's tax rate to the combined,
 * net-of-discount taxable base.
 */
export function computeMergedInvoiceTotals(
  lineItems: MergeLineItemInput[],
  invoices: MergeInvoiceInput[],
  parentTaxRateBps: number
): MergedInvoiceTotals {
  const netLineCents = (li: MergeLineItemInput) => li.totalCents - (li.discountCents ?? 0);

  const subtotal = lineItems.reduce((s, li) => s + netLineCents(li), 0);
  const combinedDiscountCents = invoices.reduce((s, i) => s + (i.discountCents ?? 0), 0);
  const afterDiscount = subtotal - combinedDiscountCents;

  const taxableSubtotal = lineItems.filter((li) => li.isTaxable).reduce((s, li) => s + netLineCents(li), 0);
  const taxableBase = Math.max(0, taxableSubtotal - combinedDiscountCents);
  const taxCents = Math.round((taxableBase * parentTaxRateBps) / 10000);

  const total = afterDiscount + taxCents;
  const alreadyPaid = invoices.reduce((s, i) => s + (i.amountPaidCents ?? 0), 0);
  const newBalance = Math.max(0, total - alreadyPaid);

  return {
    subtotalCents: subtotal,
    discountCents: combinedDiscountCents,
    taxCents,
    totalCents: total,
    amountPaidCents: alreadyPaid,
    balanceCents: newBalance,
  };
}
