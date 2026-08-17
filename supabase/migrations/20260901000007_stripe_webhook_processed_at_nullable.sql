-- The webhook route inserted a stripe_webhook_events row (processed_at
-- defaulting to now()) BEFORE running applySubscriptionToOrg/
-- notifyPaymentFailed. If processing then threw (transient DB error, Stripe
-- API hiccup), the route returned 500 but the row — already marked
-- "processed" by the DEFAULT now() — was already committed. Stripe's retry
-- of the same event then hit the event_id unique constraint and was treated
-- as an already-handled duplicate (200 OK), so the event was never actually
-- applied and Stripe stopped retrying — permanently losing that
-- subscription-state update on any transient failure.
--
-- processed_at now defaults to NULL and is only set by the route after
-- processing succeeds, so a duplicate insert can distinguish "genuinely
-- already handled" (processed_at IS NOT NULL) from "a previous attempt
-- recorded this event but died before finishing" (processed_at IS NULL,
-- safe to reprocess).

ALTER TABLE public.stripe_webhook_events
  ALTER COLUMN processed_at DROP NOT NULL,
  ALTER COLUMN processed_at DROP DEFAULT;
