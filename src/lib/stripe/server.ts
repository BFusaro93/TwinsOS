import Stripe from "stripe";

let cachedLive: Stripe | null = null;
let cachedTest: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Whether a test-mode platform key is configured — set only for orgs whose
 * Stripe Connect account was created in Stripe test mode (see
 * getStripeForOrg() below). Most deployments never set this. */
export function isStripeTestConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY_TEST);
}

/** Throws if STRIPE_SECRET_KEY isn't set — callers must check isStripeConfigured() first. */
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!cachedLive) {
    cachedLive = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cachedLive;
}

/** Throws if STRIPE_SECRET_KEY_TEST isn't set — callers must check isStripeTestConfigured() first. */
function getStripeTest(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY_TEST) {
    throw new Error("STRIPE_SECRET_KEY_TEST is not set");
  }
  if (!cachedTest) {
    cachedTest = new Stripe(process.env.STRIPE_SECRET_KEY_TEST);
  }
  return cachedTest;
}

/**
 * Returns the Stripe client that should be used for API calls scoped to a
 * particular org's Connect account (`{ stripeAccount: ... }` calls,
 * `accounts.retrieve`, webhook-triggered lookups against that account, etc).
 *
 * The platform's own STRIPE_SECRET_KEY is a live-mode key. A connected
 * account created in Stripe test mode rejects every call made with a
 * live-mode key ("provided key does not have access to account") — this
 * picks the matching key based on `organizations.stripe_connect_livemode`.
 *
 * `livemode === false` (the account is known to be test-mode) uses
 * STRIPE_SECRET_KEY_TEST when it's configured. Every other case — `true`,
 * `null`/`undefined` (unknown/not yet connected), or no test key configured
 * — falls back to the live client, which is today's behavior.
 */
export function getStripeForOrg(livemode: boolean | null | undefined): Stripe {
  if (livemode === false && isStripeTestConfigured()) {
    return getStripeTest();
  }
  return getStripe();
}

/**
 * The actual mode (`true` = live, `false` = test) of the client
 * getStripeForOrg() would return for the same `livemode` input. Stripe's
 * Account object has no `livemode` field of its own (unlike most other API
 * resources) — the account's mode is only knowable by which key successfully
 * answers for it — so callers that need to persist
 * `organizations.stripe_connect_livemode` after a successful API call use
 * this instead of trying to read it off the response.
 */
export function resolvedStripeMode(livemode: boolean | null | undefined): boolean {
  return !(livemode === false && isStripeTestConfigured());
}
