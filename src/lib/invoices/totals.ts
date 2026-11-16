/**
 * How a document-level discount reduces the taxable base.
 *
 * - `pro_rata`: by the taxable lines' share of the subtotal. $1,000 of
 *   non-taxable labor + $200 of taxable materials with a $200 discount takes
 *   $200 × 200/1200 = $33.33 off the taxable $200. Every invoice created (and
 *   every draft) from round 14 on.
 * - `taxable_first`: the whole discount comes off the taxable lines first (the
 *   example above then has no tax at all). Kept only for invoices issued
 *   before the change, so their totals never move.
 *
 * Stored on crm_invoices.discount_tax_basis; NULL is a pre-change row and
 * resolves by status (resolveDiscountTaxBasis) — the same rule as the SQL
 * function _invoice_discount_tax_basis.
 */
export type DiscountTaxBasis = "pro_rata" | "taxable_first";

export function resolveDiscountTaxBasis(basis: string | null | undefined, status: string | null | undefined): DiscountTaxBasis {
  if (basis === "pro_rata" || basis === "taxable_first") return basis;
  return status === "draft" ? "pro_rata" : "taxable_first";
}

/**
 * The taxable base after the document discount. Mirrors the SQL function
 * public._invoice_taxable_base, which increment_invoice_totals and
 * crm_release_job_product_from_invoice use, so every path taxes the same.
 */
export function invoiceTaxableBaseCents(input: {
  taxableNetCents: number;
  subtotalCents: number;
  discountCents: number;
  basis?: DiscountTaxBasis;
}): number {
  const { taxableNetCents, subtotalCents, discountCents } = input;
  let share: number;
  if (discountCents <= 0) share = 0;
  else if ((input.basis ?? "pro_rata") === "taxable_first") share = discountCents;
  else if (subtotalCents <= 0 || taxableNetCents <= 0) share = 0;
  else if (taxableNetCents >= subtotalCents) share = discountCents;
  else share = Math.round((discountCents * taxableNetCents) / subtotalCents);
  return Math.max(0, taxableNetCents - share);
}

/**
 * The one place an invoice's header totals are derived from its lines.
 *
 * Subtotal is net of each line's own discount. The document-level discount is
 * re-derived from discount_type/discount_value when it is a percent (bps of the
 * CURRENT subtotal — the stored discount_cents is only a snapshot and goes
 * stale as lines change), then clamped to [0, subtotal] so it can never push
 * the invoice negative. Tax applies to taxable lines net of their share of the
 * document discount (invoiceTaxableBaseCents; never negative). Mirrors
 * increment_invoice_totals in SQL.
 *
 * Pass the invoice's own `discountTaxBasis` (resolveDiscountTaxBasis): an
 * invoice issued before the pro-rata rule keeps its old figures.
 */
export function computeInvoiceTotals(input: {
  lines: { totalCents: number; discountCents: number; isTaxable: boolean }[];
  discountCents: number;
  discountType?: "percent" | "flat" | null;
  discountValue?: number | null;
  taxRateBps: number;
  discountTaxBasis?: DiscountTaxBasis;
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
  const taxableBase = invoiceTaxableBaseCents({
    taxableNetCents: taxableSubtotal,
    subtotalCents,
    discountCents,
    basis: input.discountTaxBasis,
  });
  const taxCents = Math.round((taxableBase * taxRateBps) / 10000);
  const totalCents = subtotalCents - discountCents + taxCents;
  return { subtotalCents, discountCents, taxRateBps, taxCents, totalCents };
}
