import Stripe from "stripe";
import { NextResponse } from "next/server";
import type { Logger } from "@/lib/logger";

/**
 * Maps a failure from a Stripe call into an HTTP response the UI can show.
 * Card declines are the client's problem (402); every other Stripe-side
 * rejection (permission, invalid request, connectivity) is a 502 that
 * carries Stripe's own message instead of an opaque empty 500 — most
 * importantly the "provided key does not have access to account" case,
 * which is a platform-key/connected-account mode mismatch (live key vs a
 * test-mode connection, or a revoked connection), not a bug the office user
 * can do anything about without knowing what happened.
 */
export function stripeErrorResponse(
  err: unknown,
  log: Pick<Logger, "error">,
  context: Record<string, unknown>,
): NextResponse {
  if (err instanceof Stripe.errors.StripeCardError) {
    return NextResponse.json(
      { error: err.message || "The payment method was declined" },
      { status: 402 },
    );
  }
  if (err instanceof Stripe.errors.StripeError) {
    log.error("stripe request failed", { ...context, error: err });
    const modeMismatch = /does not have access to account|Application access may have been revoked/i.test(err.message);
    const message = modeMismatch
      ? `Stripe rejected the request for this connected account: ${err.message} This usually means the connected account and the platform's Stripe key are in different modes (test vs live) or the connection was revoked — reconnect Stripe under Settings → Integrations.`
      : `Stripe error: ${err.message}`;
    return NextResponse.json({ error: message }, { status: 502 });
  }
  log.error("charge failed", { ...context, error: err });
  return NextResponse.json({ error: "Failed to process the payment" }, { status: 500 });
}
