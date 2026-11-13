import { createHash } from "crypto";
import type Stripe from "stripe";

/**
 * Deterministic Stripe idempotency key for a charge/resource-creation
 * attempt. None of these routes receive a client-generated idempotency
 * token, so this buckets by a short time window instead: two calls with the
 * same identifying parts (invoice id, client id, amount, ...) within the
 * same window collapse to the same key, so a double-click on "Charge Card"/
 * "Pay Now" or a browser's automatic retry of an in-flight request hits
 * Stripe's own idempotency cache instead of creating a second real charge.
 * A genuinely new attempt (a retry after the window passes, or different
 * parameters) gets a fresh key and is not deduped.
 */
export function chargeIdempotencyKey(parts: (string | number)[], windowSeconds = 10): string {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  return createHash("sha256").update([...parts, bucket].join(":")).digest("hex");
}

/** Whether Stripe answered this request from its idempotency cache (the
 *  `Idempotent-Replayed` response header) rather than performing it. */
function wasIdempotentReplay(resource: { lastResponse?: { headers?: unknown } }): boolean {
  const headers = resource.lastResponse?.headers as
    | { get?: (name: string) => string | null; [key: string]: unknown }
    | undefined;
  if (!headers) return false;
  const value = typeof headers.get === "function" ? headers.get("idempotent-replayed") : headers["idempotent-replayed"];
  return String(value ?? "").toLowerCase() === "true";
}

/**
 * Creates a customer-facing PaymentIntent keyed by chargeIdempotencyKey, but
 * never hands back one that has since been CANCELED.
 *
 * The 10-second bucket means a client who switches card -> bank -> card
 * quickly sends the same key twice for the card intent; the second create is
 * answered from Stripe's idempotency cache with the FIRST card intent — which
 * the switch to bank already canceled, so its form could never be paid.
 * Callers put the ids of intents they just canceled into `keyParts` (that
 * alone gives the third request a new key); as a backstop, a replayed answer
 * is re-read and, if it is canceled, a fresh intent is created under a key
 * that also names the dead one.
 */
export async function createPaymentIntentNotCanceled(
  stripe: Stripe,
  params: Stripe.PaymentIntentCreateParams,
  opts: { stripeAccount: string; keyParts: (string | number)[] }
): Promise<Stripe.PaymentIntent> {
  const first = await stripe.paymentIntents.create(params, {
    stripeAccount: opts.stripeAccount,
    idempotencyKey: chargeIdempotencyKey(opts.keyParts),
  });
  if (!wasIdempotentReplay(first)) return first;
  const live = await stripe.paymentIntents.retrieve(first.id, undefined, { stripeAccount: opts.stripeAccount });
  if (live.status !== "canceled") return live;
  return stripe.paymentIntents.create(params, {
    stripeAccount: opts.stripeAccount,
    idempotencyKey: chargeIdempotencyKey([...opts.keyParts, "replaced", first.id]),
  });
}

/**
 * Idempotency key for a refund, derived from a client-generated token (one per
 * refund-dialog open) instead of a time bucket. Same token + payment + amount
 * always maps to the same key, however far apart the retries are; a new dialog
 * open (new token) is a genuinely new refund.
 */
export function refundIdempotencyKey(paymentId: string, amountCents: number, token: string): string {
  return createHash("sha256").update(["refund-token", paymentId, amountCents, token].join(":")).digest("hex");
}
