-- Records whether an org's Stripe Connect account (stripe_connect_account_id)
-- was created in Stripe LIVE mode or TEST mode. The platform's own
-- STRIPE_SECRET_KEY is a live-mode key; a connected account created in test
-- mode rejects every API call made with a live-mode key ("provided key does
-- not have access to account"). getStripeForOrg() (src/lib/stripe/server.ts)
-- uses this column to pick STRIPE_SECRET_KEY_TEST instead for such orgs.
--
-- Nullable: null means unknown / not yet connected. Existing orgs with a
-- stripe_connect_account_id already on file are NOT backfilled by this
-- migration (Stripe can't be called from a migration) — see the companion
-- one-off script scripts/backfill-stripe-livemode.ts.
alter table organizations
  add column if not exists stripe_connect_livemode boolean;

comment on column organizations.stripe_connect_livemode is
  'Whether this org''s Stripe Connect account was created in Stripe live mode (true) or test mode (false). Null = unknown/not yet connected. Set on new Connect onboarding, and self-healed by syncConnectStatusFromStripe() and the account.updated webhook whenever Stripe is queried directly.';
