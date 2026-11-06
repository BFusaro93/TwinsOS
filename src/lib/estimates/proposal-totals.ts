import { estimateTotalsForSubtotal } from "@/lib/estimate-calc";

/**
 * Client-side totals for a proposal whose selection changed (items unchecked,
 * a Good/Better/Best tier picked). Shared by the public proposal page and the
 * client portal so both show exactly what the accept routes record: they mark
 * lines won/lost and run recalcEstimateTotals, which uses these same rules.
 */

/** A line's client-facing value: its total less its own line discount
 *  (floored at 0) plus its priced sub-items — recalcEstimateTotals' per-line
 *  rule. Older sent versions lack discountCents / subitemTotalCents (0). */
export function proposalLineNet(li: { totalCents: number; discountCents?: number | null; subitemTotalCents?: number | null }): number {
  return Math.max(0, li.totalCents - (li.discountCents ?? 0)) + (li.subitemTotalCents ?? 0);
}

/** Header discount (percent re-derived, flat = the amount asked for, clamped
 *  to the subtotal), then tax on the discounted amount. */
export function deriveProposalTotals(
  p: { discountCents: number; discountType: string | null; discountValue: number | null; taxRateBps: number },
  subtotalCents: number,
): { subtotalCents: number; discountCents: number; taxCents: number; totalCents: number } {
  return estimateTotalsForSubtotal(p, subtotalCents);
}
