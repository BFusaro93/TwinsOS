import type Stripe from "stripe";

/**
 * Card surcharges and debit cards.
 *
 * Debit and prepaid cards can never be surcharged, but the type of a NEW card is only known after
 * the customer has entered it — after the PaymentIntent (and the fee in its amount) already exists.
 * So when a fee applies, the intent is created as an AUTHORIZATION (`capture_method: "manual"`) and
 * settled as soon as the card is on it: capture the whole amount for a credit card, or only the
 * invoice balance for debit/prepaid/unknown (the fee part of the hold is released).
 *
 * Metadata written at creation:
 *   surcharge_pending = "1"   until settled
 *   surcharge_cents           the fee included in `amount` (never changed — a retried settle needs it)
 * `fee_cents` (read by the recorder) is set to "0" before capturing a non-credit card.
 */

/** Params to spread into `paymentIntents.create` for a card charge that includes a fee. */
export function surchargeIntentParams(feeCents: number, isCard: boolean): { capture_method?: "manual" } {
  return isCard && feeCents > 0 ? { capture_method: "manual" } : {};
}

/** Metadata to merge into the intent's metadata for a card charge that includes a fee. */
export function surchargeIntentMetadata(feeCents: number, isCard: boolean): Record<string, string> {
  return isCard && feeCents > 0 ? { surcharge_pending: "1", surcharge_cents: String(feeCents) } : {};
}

export type SettleResult = "captured" | "not_applicable" | "already_settled";

/**
 * Settles one surcharge authorization. Idempotent and safe to call from the webhook, the sweep cron
 * and a retry: anything that isn't a pending authorization is left alone. Throws on a Stripe error
 * so the caller can retry (the webhook answers 500; the cron tries again next run).
 */
export async function settleSurchargeAuthorization(
  stripe: Stripe,
  intent: Stripe.PaymentIntent,
  connectedAccountId: string
): Promise<SettleResult> {
  const opts = { stripeAccount: connectedAccountId };
  const md = intent.metadata ?? {};
  if (md.surcharge_pending !== "1") return "not_applicable";
  if (intent.status === "succeeded" || intent.status === "processing") return "already_settled";
  if (intent.status !== "requires_capture") return "not_applicable";

  const surchargeCents = Math.max(0, parseInt(md.surcharge_cents ?? "0", 10) || 0);

  // Credit is the only funding type that may carry a surcharge; an unreadable card counts as not.
  let allowsSurcharge = false;
  try {
    const pmId = typeof intent.payment_method === "string" ? intent.payment_method : intent.payment_method?.id;
    const pm =
      intent.payment_method && typeof intent.payment_method !== "string"
        ? intent.payment_method
        : pmId
          ? await stripe.paymentMethods.retrieve(pmId, undefined, opts)
          : null;
    allowsSurcharge = pm?.card?.funding === "credit";
  } catch {
    allowsSurcharge = false;
  }

  if (allowsSurcharge || surchargeCents === 0) {
    await captureOrIgnore(stripe, intent.id, opts, undefined);
    return "captured";
  }

  const amountToCapture = intent.amount - surchargeCents;
  if (amountToCapture <= 0) {
    // Nothing sensible to keep; release the hold rather than charge a fee-only amount.
    await stripe.paymentIntents.cancel(intent.id, undefined, opts);
    return "captured";
  }
  // The recorder reads fee_cents off the succeeded event, so zero it BEFORE capturing. surcharge_pending
  // stays "1" until the capture lands (the intent's status guards it after that), so a capture that
  // fails here is picked up and retried by the next webhook delivery or sweep.
  await stripe.paymentIntents.update(intent.id, { metadata: { fee_cents: "0" } }, opts);
  await captureOrIgnore(stripe, intent.id, opts, amountToCapture);
  return "captured";
}

async function captureOrIgnore(
  stripe: Stripe,
  intentId: string,
  opts: { stripeAccount: string },
  amountToCapture: number | undefined
): Promise<void> {
  try {
    await stripe.paymentIntents.capture(intentId, amountToCapture !== undefined ? { amount_to_capture: amountToCapture } : {}, opts);
  } catch (err) {
    // A concurrent settle (webhook + cron) already captured it: fine.
    const code = (err as { code?: string } | null)?.code;
    if (code === "payment_intent_unexpected_state") return;
    throw err;
  }
}
