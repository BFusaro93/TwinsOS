-- No schema change. Kept as a record of why, and because it has already been
-- applied to TEST.
--
-- The Connect webhook (src/app/api/crm/payments/connect-webhook/route.ts) was
-- treating ANY 23505 on stripe_webhook_events.event_id as "already handled".
-- That row commits before the handler runs, so a transient failure afterwards
-- returned 500, Stripe retried, and the retry short-circuited on the duplicate
-- branch without doing anything. For payment_intent.succeeded on an ACH debit
-- or a browser-confirmed card this route is the only thing that records the
-- payment: the customer was charged and nothing was written. Delivery was
-- effectively at-most-once.
--
-- The fix needs no DDL. stripe_webhook_events.processed_at already exists and
-- is already nullable, and the BILLING webhook already relies on exactly the
-- semantics required here — see 20260819032450 and 20260824113842, which made
-- the column nullable specifically so that "we have seen this event"
-- (a row exists) could be told apart from "we have finished this event"
-- (processed_at is not null). The Connect route simply never participated: it
-- inserted without setting processed_at and never stamped it afterwards.
--
-- So the change is entirely in that route — reprocess when processed_at is
-- null, stamp it once the handler completes.
--
-- Deliberately NOT backfilling existing rows. An earlier draft of this
-- migration stamped every null processed_at as processed, on the theory that
-- historical Connect deliveries had returned 200. But null is load-bearing for
-- the billing webhook, where it marks a delivery that died mid-handler and is
-- still legitimately awaiting a Stripe retry. Blanket-stamping would have
-- suppressed those retries — trading the bug being fixed here for the same bug
-- on the other route. Stripe stops retrying after ~3 days, so genuinely stale
-- null rows are inert and need no cleanup.

-- Idempotent guard only: asserts the column this route now depends on is
-- present and nullable, so a fresh environment fails loudly here rather than
-- silently mis-deduping payments at runtime.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_webhook_events'
      and column_name = 'processed_at'
  ) then
    raise exception 'stripe_webhook_events.processed_at is missing — the Connect webhook dedupe depends on it';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stripe_webhook_events'
      and column_name = 'processed_at'
      and is_nullable = 'NO'
  ) then
    alter table public.stripe_webhook_events alter column processed_at drop not null;
  end if;
end $$;
