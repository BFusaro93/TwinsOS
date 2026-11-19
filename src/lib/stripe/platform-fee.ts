/**
 * Platform application fee on Stripe charges.
 *
 * Every charge is a direct charge on the org's connected account, so the
 * platform's cut is the PaymentIntent's `application_fee_amount`. The rate is
 * per organization (`organizations.platform_fee_bps`, staff-only) so a
 * negotiated price is just a column update. Existing orgs are at 0.
 *
 * The fee is a share of the TOTAL amount charged to the client (invoice
 * balance plus any card surcharge) — the same base Stripe's own percentage
 * uses. Amounts are integer cents; the result is rounded to a whole cent, so a
 * tiny charge (under ~$5 at 0.1%) rounds to 0 and carries no fee.
 *
 * CARD ONLY: ACH (us_bank_account) never carries the fee. Stripe's ACH price is
 * capped at $5 but ours would not be, so on large bank payments our share would
 * dwarf Stripe's, and ACH is the fee-free alternative clients are steered to.
 */

export const DEFAULT_PLATFORM_FEE_BPS = 10;

/** Fee in cents for `amountCents` at `bps` basis points. Never negative; 0 for a bad rate. */
export function platformFeeCents(bps: number | null | undefined, amountCents: number): number {
  if (!bps || bps <= 0 || !Number.isFinite(bps) || amountCents <= 0) return 0;
  return Math.round((amountCents * bps) / 10000);
}

/**
 * Params to spread into `paymentIntents.create`. Empty when there is no fee,
 * so a grandfathered org's request is byte-for-byte what it was before.
 */
export function platformFeeParams(
  bps: number | null | undefined,
  amountCents: number,
  paymentMethod: string
): { application_fee_amount?: number } {
  if (paymentMethod !== "card") return {};
  const fee = platformFeeCents(bps, amountCents);
  return fee > 0 ? { application_fee_amount: fee } : {};
}

/**
 * Fee for a smaller capture of an intent created with a fee: scaled from the
 * fee the intent already carries, so a debit card (surcharge released) pays the
 * fee on what is actually captured, not on the authorized hold.
 */
export function scaledPlatformFeeCents(
  authorizedFeeCents: number | null | undefined,
  authorizedAmountCents: number,
  captureAmountCents: number
): number {
  if (!authorizedFeeCents || authorizedFeeCents <= 0 || authorizedAmountCents <= 0) return 0;
  return Math.round((authorizedFeeCents * captureAmountCents) / authorizedAmountCents);
}
