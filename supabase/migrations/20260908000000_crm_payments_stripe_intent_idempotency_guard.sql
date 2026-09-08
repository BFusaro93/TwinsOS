-- Idempotency key for Stripe charges, now that TWO writers can record the same
-- PaymentIntent:
--   1. the synchronous path in src/app/api/crm/payments/autopay/charge{,-multi}
--      (off-session confirm returns a terminal `succeeded` right there), and
--   2. the Connect webhook, which stays the backstop and the only applier for
--      browser-confirmed intents and for ACH.
--
-- Both go through src/lib/stripe/record-charge.ts, which INSERTs into
-- crm_payments carrying stripe_payment_intent_id and treats a 23505 unique
-- violation as "already recorded" — so under a genuine concurrent double-write
-- exactly one row is created and the loser touches no invoice balance. That
-- guarantee is the database's, not the application's, which is the point.
--
-- The column and its unique partial index already exist on PROD (added by
-- 20260723034900_crm_card_payment_processing.sql, re-asserted by
-- 20260828050000_fix_crm_payments_stripe_intent_index_catchup.sql). This
-- migration is a fully idempotent guard so any environment that drifted (the
-- TEST project has drifted before) is definitely correct BEFORE the new
-- synchronous recording code ships — without it the INSERT fails on a missing
-- column and a charged card again goes unrecorded.
--
-- The index is deliberately global rather than per-org: a Stripe PaymentIntent
-- id is globally unique, so a global unique constraint is strictly stronger
-- than a per-org one and additionally prevents the same intent being recorded
-- under two different org_ids.

ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_payments_stripe_payment_intent_id_idx
  ON public.crm_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
