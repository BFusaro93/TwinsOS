/**
 * True only when the card is positively a CREDIT card. Debit and prepaid cards can never be
 * surcharged (federal law and the card networks' rules), so an unreadable or unknown funding type
 * counts as "no surcharge" — undercharging the fee is recoverable, surcharging a debit card is not.
 */
export async function cardAllowsSurcharge(
  stripe: { paymentMethods: { retrieve: (id: string, params: undefined, opts: { stripeAccount: string }) => Promise<{ card?: { funding?: string | null } | null }> } },
  connectedAccountId: string,
  paymentMethodId: string
): Promise<boolean> {
  try {
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId, undefined, { stripeAccount: connectedAccountId });
    return pm.card?.funding === "credit";
  } catch {
    return false;
  }
}

export interface OrgFeeSettings {
  ccProcessingFeeEnabled: boolean;
  ccProcessingFeeBps: number;
  ccProcessingFeeThresholdCents: number;
  /** 'flat' (default) = bps of the balance; 'cover_fee' = gross up so the org nets the balance after Stripe's card fee. */
  ccProcessingFeeMode?: string | null;
}

/** Stripe's standard US card pricing (2.9% + $0.30), used by the 'cover the card fee' surcharge mode. */
export const STRIPE_CARD_RATE = 0.029;
export const STRIPE_CARD_FIXED_CENTS = 30;

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
  if (eligible && org.ccProcessingFeeMode === "cover_fee") {
    // Stripe takes RATE x total + FIXED off the whole charge, surcharge included, so charge
    // T = (balance + FIXED) / (1 - RATE): T minus Stripe's cut is exactly the invoice balance.
    const totalChargeCents = Math.ceil((balanceCents + STRIPE_CARD_FIXED_CENTS) / (1 - STRIPE_CARD_RATE));
    return { feeCents: totalChargeCents - balanceCents, totalChargeCents };
  }
  const feeCents = eligible ? Math.round((balanceCents * org.ccProcessingFeeBps) / 10000) : 0;
  return { feeCents, totalChargeCents: balanceCents + feeCents };
}

const CARD_BRAND_TO_METHOD: Record<string, string> = {
  amex: "Credit Card- AmEx",
  discover: "Credit Card- Discover",
  mastercard: "Credit Card- MasterCard",
  visa: "Credit Card- Visa",
};

const DEBIT_BRAND_TO_METHOD: Record<string, string> = {
  discover: "Debit Card- Discover",
  mastercard: "Debit Card- MasterCard",
  visa: "Debit Card- Visa",
};

/** Debit and prepaid cards are labelled "Debit Card" (the same funding types the surcharge
 * skips); AmEx has no debit product, so it always stays a credit card. */
export function methodForCardBrand(brand: string | null | undefined, funding?: string | null): string {
  if (brand && (funding === "debit" || funding === "prepaid") && DEBIT_BRAND_TO_METHOD[brand]) {
    return DEBIT_BRAND_TO_METHOD[brand];
  }
  return (brand && CARD_BRAND_TO_METHOD[brand]) ?? "Other";
}

/** crm_payments.method for a succeeded PaymentIntent — ACH never has a "card brand"
 * to look up, so it's tagged directly from the payment method type used. */
export function methodForPaymentIntent(
  paymentMethodTypes: string[],
  cardBrand: string | null | undefined,
  cardFunding?: string | null
): string {
  if (paymentMethodTypes.includes("us_bank_account")) return "ACH/E-Check";
  return methodForCardBrand(cardBrand, cardFunding);
}

export interface InvoiceAllocation {
  invoiceId: string;
  amountCents: number;
}

/** A single charge split across multiple invoices is carried through Stripe metadata as a
 * compact "invoiceId:amountCents,invoiceId:amountCents" string — metadata values are capped
 * at 500 characters, so this stays far more compact than JSON for the handful of invoices a
 * real charge would ever cover. */
export function encodeAllocations(allocations: InvoiceAllocation[]): string {
  return allocations.map((a) => `${a.invoiceId}:${a.amountCents}`).join(",");
}

export function decodeAllocations(encoded: string): InvoiceAllocation[] {
  return encoded
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const [invoiceId, amountStr] = pair.split(":");
      return { invoiceId, amountCents: parseInt(amountStr, 10) };
    });
}

/** Stripe metadata values are capped at 500 characters — this is the practical limit on how
 * many invoices one charge can be split across. */
export const MAX_ALLOCATION_METADATA_LENGTH = 500;
