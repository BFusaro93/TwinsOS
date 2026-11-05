// The estimate-specific half of the merge vocabulary (ESTIMATE_TAGS in
// src/types/crm-documents.ts), shared by the estimate email, the proposal
// page/PDF and the accept confirmation so every tag the Documents picker
// offers resolves the same way on each. Values are RAW; resolveMergeTags
// escapes at substitution. [estimatelink]/[estimatelinkurl]/[estimategrid]
// and the installment tags are surface-specific and set by the caller.

function fmtCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

const DATE_OPTS: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };

export interface EstimateMergeSource {
  estimate_number: number | string | null;
  estimate_date?: string | null;
  created_at?: string | null;
  valid_until_date?: string | null;
  notes?: string | null;
  subtotal_cents?: number | null;
  total_cents?: number | null;
  discount_cents?: number | null;
}

export function estimateMergeTags(
  est: EstimateMergeSource,
  opts: { timeZone: string; salesRepName?: string | null; orgName: string }
): Record<string, string> {
  const number = String(est.estimate_number ?? "").padStart(5, "0");
  const quoteDate = est.estimate_date
    ? new Date(`${est.estimate_date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", DATE_OPTS)
    : est.created_at
      ? new Date(est.created_at).toLocaleDateString("en-US", { ...DATE_OPTS, timeZone: opts.timeZone })
      : "";
  const subtotal = est.subtotal_cents ?? 0;
  const discount = Math.max(0, est.discount_cents ?? 0);
  const total = est.total_cents ?? 0;
  const discountPct = subtotal > 0 && discount > 0
    ? `${(Math.round((discount / subtotal) * 1000) / 10).toString()}%`
    : "0%";
  return {
    "[estimatenumber]": number,
    "[estimatecode]": `EST-${number}`,
    "[estimatedate]": quoteDate,
    "[estimatevaliduntil]": est.valid_until_date
      ? new Date(`${est.valid_until_date.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", DATE_OPTS)
      : "",
    "[estimatesubtotal]": fmtCents(subtotal),
    "[estimatetotal]": fmtCents(total),
    // total_cents is already net of the estimate discount (subtotal − discount + tax).
    "[estimatetotallessdiscounts]": fmtCents(total),
    "[estimatediscountpct]": discountPct,
    "[estimatediscountamt]": fmtCents(discount),
    "[estimatenotes]": est.notes ?? "",
    // The estimate's own rep; the company name only when none is assigned.
    "[salesrepname]": opts.salesRepName || opts.orgName,
  };
}
