-- Idempotency + stale-event-ordering guard for the Stripe billing webhook
-- (src/app/api/billing/webhook/route.ts). Stripe redelivers events and does
-- not guarantee delivery order; the handler previously had neither a
-- dedup check nor an ordering check, so a retried older event landing after
-- a newer one had already been applied could silently revert an org's
-- plan/stripe_subscription_status to stale data.
--
-- event_id has a UNIQUE constraint — the webhook route inserts a row for
-- every event it sees BEFORE processing it; a duplicate insert (same event
-- redelivered) fails the unique constraint and the handler treats that as
-- "already processed, skip". For events tied to a subscription, the route
-- also checks whether a later event_created for the same subscription_id
-- has already been recorded, and skips applying state if so.

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id          text PRIMARY KEY,
  event_type        text NOT NULL,
  subscription_id   text,
  event_created     timestamptz NOT NULL,
  processed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_subscription_idx
  ON public.stripe_webhook_events(subscription_id, event_created DESC)
  WHERE subscription_id IS NOT NULL;

-- Internal bookkeeping only, written/read exclusively by the webhook route
-- via the service-role key — RLS enabled with no policies blocks all other access.
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
