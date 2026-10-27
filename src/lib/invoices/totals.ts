/**
 * The one place an invoice's header totals are derived from its lines.
 *
 * Subtotal is net of each line's own discount. The document-level discount is
 * re-derived from discount_type/discount_value when it is a percent (bps of the
 * CURRENT subtotal — the stored discount_cents is only a snapshot and goes
 * stale as lines change), then clamped to [0, subtotal] so it can never push
 * the invoice negative. Tax applies to taxable lines net of the document
 * discount (never negative). Mirrors increment_invoice_totals in SQL.
 */
export function computeInvoiceTotals(input: {
  lines: { totalCents: number; discountCents: number; isTaxable: boolean }[];
  discountCents: number;
  discountType?: "percent" | "flat" | null;
  discountValue?: number | null;
  taxRateBps: number;
}) {
  const netLineCents = (li: { totalCents: number; discountCents: number }) => li.totalCents - li.discountCents;
  const subtotalCents = input.lines.reduce((s, li) => s + netLineCents(li), 0);
  const rawDiscountCents =
    input.discountType === "percent"
      ? Math.round(Math.max(0, subtotalCents) * ((input.discountValue ?? 0) / 10000))
      : input.discountCents;
  const discountCents = Math.min(Math.max(0, rawDiscountCents), Math.max(0, subtotalCents));
  const taxRateBps = Math.min(Math.max(0, input.taxRateBps), 10000);
  const taxableSubtotal = input.lines.filter((li) => li.isTaxable).reduce((s, li) => s + netLineCents(li), 0);
  const taxableBase = Math.max(0, taxableSubtotal - discountCents);
  const taxCents = Math.round((taxableBase * taxRateBps) / 10000);
  const totalCents = subtotalCents - discountCents + taxCents;
  return { subtotalCents, discountCents, taxRateBps, taxCents, totalCents };
}
