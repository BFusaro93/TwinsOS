import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";

export function hasPublishableKey(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
}

// PaymentIntents for crm_invoice payments are created directly on the org's
// connected Stripe account (a "direct charge"), so Stripe.js must be
// initialized scoped to that same account — a platform-scoped instance can't
// find/confirm it. Cached per account id so re-opening a payment dialog for
// the same org doesn't reload Stripe.js.
const scopedStripeJsCache = new Map<string, Promise<StripeJs | null>>();

export function getScopedStripeJs(connectedAccountId: string): Promise<StripeJs | null> | null {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  let cached = scopedStripeJsCache.get(connectedAccountId);
  if (!cached) {
    cached = loadStripe(key, { stripeAccount: connectedAccountId });
    scopedStripeJsCache.set(connectedAccountId, cached);
  }
  return cached;
}
