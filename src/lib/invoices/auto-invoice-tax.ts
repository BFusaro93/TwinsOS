/**
 * Pure helpers shared by every "invoice a job" path — the server-side
 * visit-completion auto-invoice (src/lib/visits/complete-visit-side-effects.ts)
 * and the client-side useCreateInvoiceFromJob mutation (JobDetail / Dispatch
 * Board buttons) — so an invoice for the same job is priced and taxed the
 * same way whichever path creates it.
 *
 * All money is integer cents.
 */

/**
 * Line total for a rate × quantity. Quantities are numeric (1.5 hours, 2.25
 * yards), so the raw product can be fractional — and plain float math drifts
 * even for "nice" values (110 × 1.1 = 121.00000000000001). Every *_cents
 * column is an integer, so always round here.
 */
export function lineTotalCents(rateCents: number, qty: number): number {
  return Math.round(rateCents * qty);
}

/**
 * Invoice tax rate: the accepted estimate's rate when the job came from one
 * (so the invoice reproduces the tax the client agreed to), otherwise the
 * client's default rate.
 */
export function resolveAutoInvoiceTaxRateBps(
  estimateTaxRateBps: number | null | undefined,
  clientDefaultTaxRateBps: number | null | undefined,
): number {
  const est = estimateTaxRateBps ?? 0;
  if (est > 0) return est;
  return clientDefaultTaxRateBps ?? 0;
}

/**
 * A job service's taxability: the flag snapshotted on crm_job_services when
 * the job was created, falling back to the service catalog's flag for rows
 * that predate the column. Products and the job-rate fallback line are never
 * taxable on an auto-invoice.
 */
export function resolveJobServiceTaxable(
  jobServiceIsTaxable: boolean | null | undefined,
  catalogIsTaxable: boolean | null | undefined,
): boolean {
  return jobServiceIsTaxable ?? catalogIsTaxable ?? false;
}

/** Header totals for a fresh (undiscounted) auto-invoice. */
export function computeAutoInvoiceTotals(
  lines: { totalCents: number; isTaxable: boolean }[],
  taxRateBps: number,
): { subtotalCents: number; taxCents: number; totalCents: number } {
  const subtotalCents = lines.reduce((s, li) => s + li.totalCents, 0);
  const taxableSubtotal = lines.filter((li) => li.isTaxable).reduce((s, li) => s + li.totalCents, 0);
  const taxCents = Math.round((taxableSubtotal * taxRateBps) / 10000);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}
