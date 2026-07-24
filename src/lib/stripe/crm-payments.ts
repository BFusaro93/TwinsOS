export interface OrgFeeSettings {
  ccProcessingFeeEnabled: boolean;
  ccProcessingFeeBps: number;
  ccProcessingFeeThresholdCents: number;
}

export interface ProcessingFeeResult {
  feeCents: number;
  totalChargeCents: number;
}

/** Fee is computed once, at the moment the card payment is taken — it never modifies the invoice itself. */
export function computeProcessingFee(
  org: OrgFeeSettings,
  balanceCents: number,
  waiveFee: boolean
): ProcessingFeeResult {
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
