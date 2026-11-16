// Shared merge-total computation used by both the merge API route
// (src/app/api/crm/invoices/merge/route.ts) and the merge preview dialog
// (src/components/crm/invoices/MergeInvoicesDialog.tsx). The dialog used to
// naively sum each invoice's own totalCents for its preview, which disagrees
// with the server whenever merged invoices have different tax rates or
// discount types — the server recomputes from scratch (net line items,
// combined discounts, tax at the PARENT's rate only). Extracting the exact
// formula here keeps the preview and the actual write in lockstep.

import { invoiceTaxableBaseCents, type DiscountTaxBasis } from "@/lib/invoices/totals";

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

/** Percent label for a tax rate in basis points: 700 -> "7%", 6625 -> "6.625%". */
function ratePercentLabel(bps: number): string {
  return `${Number((bps / 100).toFixed(3))}%`;
}

/**
 * Merging re-taxes every line at the PARENT's rate, so invoices billed at
 * different rates can't be merged: tax already billed on a child would be
 * silently dropped (parent 0%) or changed. Returns the refusal message, or
 * null when every invoice uses the same rate. crm_merge_invoices refuses the
 * same case in the database.
 */
export function mixedTaxRateMergeError(taxRatesBps: (number | null | undefined)[]): string | null {
  const rates = [...new Set(taxRatesBps.map((r) => r ?? 0))].sort((a, b) => a - b);
  if (rates.length <= 1) return null;
  return `These invoices use different tax rates (${rates.map(ratePercentLabel).join(" vs ")}). Change them to the same rate first, then merge.`;
}

/**
 * Recomputes the merged invoice's totals from the union of all merged
 * invoices' line items, combining every invoice's own document-level
 * discount and applying only the PARENT invoice's tax rate to the combined
 * taxable base net of its share of that discount (the parent's
 * discount_tax_basis — see invoiceTaxableBaseCents).
 */
export function computeMergedInvoiceTotals(
  lineItems: MergeLineItemInput[],
  invoices: MergeInvoiceInput[],
  parentTaxRateBps: number,
  parentDiscountTaxBasis: DiscountTaxBasis = "pro_rata"
): MergedInvoiceTotals {
  const netLineCents = (li: MergeLineItemInput) => li.totalCents - (li.discountCents ?? 0);

  const subtotal = lineItems.reduce((s, li) => s + netLineCents(li), 0);
  const combinedDiscountCents = invoices.reduce((s, i) => s + (i.discountCents ?? 0), 0);
  const afterDiscount = subtotal - combinedDiscountCents;

  const taxableSubtotal = lineItems.filter((li) => li.isTaxable).reduce((s, li) => s + netLineCents(li), 0);
  const taxableBase = invoiceTaxableBaseCents({
    taxableNetCents: taxableSubtotal,
    subtotalCents: subtotal,
    discountCents: combinedDiscountCents,
    basis: parentDiscountTaxBasis,
  });
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
