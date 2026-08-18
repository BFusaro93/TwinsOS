export interface OrgFeeSettings {
  ccProcessingFeeEnabled: boolean;
  ccProcessingFeeBps: number;
  ccProcessingFeeThresholdCents: number;
}

export interface ProcessingFeeResult {
  feeCents: number;
  totalChargeCents: number;
}

/** Fee is computed once, at the moment the card payment is taken — it never modifies the invoice itself.
 * `overrideFeeCents`, when provided, replaces the computed percentage fee with a staff-entered amount
 * (e.g. a discounted or rounded fee) — it takes priority over `waiveFee`. */
export function computeProcessingFee(
  org: OrgFeeSettings,
  balanceCents: number,
  waiveFee: boolean,
  overrideFeeCents?: number
): ProcessingFeeResult {
  if (overrideFeeCents !== undefined) {
    return { feeCents: overrideFeeCents, totalChargeCents: balanceCents + overrideFeeCents };
  }
  const eligible = org.ccProcessingFeeEnabled && !waiveFee && balanceCents > org.ccProcessingFeeThresholdCents;
  const feeCents = eligible ? Math.round((balanceCents * org.ccProcessingFeeBps) / 10000) : 0;
  return { feeCents, totalChargeCents: balanceCents + feeCents };
}

const CARD_BRAND_TO_METHOD: Record<string, string> = {
  amex: "Credit Card- AmEx",
  discover: "Credit Card- Discover",
  mastercard: "Credit Card- MasterCard",
  visa: "Credit Card- Visa",
};

export function methodForCardBrand(brand: string | null | undefined): string {
  return (brand && CARD_BRAND_TO_METHOD[brand]) ?? "Other";
}

/** crm_payments.method for a succeeded PaymentIntent — ACH never has a "card brand"
 * to look up, so it's tagged directly from the payment method type used. */
export function methodForPaymentIntent(paymentMethodTypes: string[], cardBrand: string | null | undefined): string {
  if (paymentMethodTypes.includes("us_bank_account")) return "ACH/E-Check";
  return methodForCardBrand(cardBrand);
}
