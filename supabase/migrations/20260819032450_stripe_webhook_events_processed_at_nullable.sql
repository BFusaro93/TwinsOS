-- stripe_webhook_events.processed_at was NOT NULL DEFAULT now(), but both
-- webhook handlers (src/app/api/billing/webhook and
-- src/app/api/crm/payments/connect-webhook) insert the dedupe row with
-- processed_at explicitly set to null, only marking it once processing
-- actually succeeds — a two-phase idempotency guard (see the billing
-- webhook's comment for why: a row with processed_at still null means a
-- prior attempt died before finishing, so it's allowed to reprocess rather
-- than being silently swallowed forever).
--
-- The NOT NULL constraint made every one of these inserts fail outright
-- (23502 violation), so the whole webhook request 500'd before ever
-- reaching the actual subscription-sync logic — every billing subscription
-- change (upgrades, downgrades, seat-overage sync) silently failed to apply
-- to organizations.plan, discovered when a Growth->Enterprise upgrade in
-- Stripe never showed up in the app.

alter table stripe_webhook_events alter column processed_at drop not null;
