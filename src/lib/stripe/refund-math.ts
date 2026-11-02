/**
 * A surcharged card payment is charged gross (net invoice amount + processing fee) but the
 * ledger credits the client only the net. Stripe reports refunds against the gross, so a
 * gross running total has to be scaled back to net before it is reconciled.
 */
export function grossToNetRefundCents(grossRefundedCents: number, netAmountCents: number, feeCents: number): number {
  if (feeCents <= 0 || netAmountCents <= 0) return grossRefundedCents;
  const gross = netAmountCents + feeCents;
  return Math.min(netAmountCents, Math.round((grossRefundedCents * netAmountCents) / gross));
}
