import { createHash } from "crypto";

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
