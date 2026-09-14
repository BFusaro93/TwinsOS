import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";

// The platform's default publishable key (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
// is a LIVE key — it's also used for the SaaS product's own subscription
// checkout (SubscriptionTab.tsx), which must never move to test mode. A
// client_secret Stripe.js confirms must come from the SAME mode as the
// publishable key doing the confirming, so an org whose Connect account is
// test-mode (organizations.stripe_connect_livemode = false — see
// getStripeForOrg in src/lib/stripe/server.ts) needs its own test-mode
// publishable key, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST, instead.
function publishableKeyFor(livemode: boolean | null | undefined): string | undefined {
  if (livemode === false) {
    return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  }
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
}

export function hasPublishableKey(livemode?: boolean | null): boolean {
  return Boolean(publishableKeyFor(livemode));
}

// PaymentIntents/SetupIntents for crm_invoice payments are created directly on
// the org's connected Stripe account (a "direct charge"), so Stripe.js must be
// initialized scoped to that same account — a platform-scoped instance can't
// find/confirm it. Cached per (account id, mode) so re-opening a payment
// dialog for the same org doesn't reload Stripe.js.
const scopedStripeJsCache = new Map<string, Promise<StripeJs | null>>();

export function getScopedStripeJs(
  connectedAccountId: string,
  livemode?: boolean | null,
): Promise<StripeJs | null> | null {
  const key = publishableKeyFor(livemode);
  if (!key) return null;
  const cacheKey = `${connectedAccountId}:${livemode === false ? "test" : "live"}`;
  let cached = scopedStripeJsCache.get(cacheKey);
  if (!cached) {
    cached = loadStripe(key, { stripeAccount: connectedAccountId });
    scopedStripeJsCache.set(cacheKey, cached);
  }
  return cached;
}
