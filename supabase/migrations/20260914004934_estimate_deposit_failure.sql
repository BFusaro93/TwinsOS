-- Records a deposit that the bank (or the card network) rejected.
--
-- payment_intent.payment_failed for a crm_estimate_deposit only cleared the
-- deposit_pending_* marker and returned 200. That left NO trace anywhere: an
-- ACH debit can bounce three business days after the proposal was accepted
-- (NSF, closed account, a mistyped routing number), and the estimate then
-- looked exactly like one where the client chose to skip the deposit. Nobody
-- was told, and the client had no way to try again — the proposal link is
-- spent once accepted_at is set, so both of its guards refuse a second
-- deposit attempt.
--
-- These columns are what makes the failure visible and the retry possible.
-- They are cleared the moment a deposit is actually recorded, so an estimate
-- never shows both a failure and a collected deposit.
alter table public.estimates
  add column if not exists deposit_failed_at     timestamptz,
  add column if not exists deposit_failed_cents  integer,
  add column if not exists deposit_failed_method text,
  add column if not exists deposit_failed_reason text;

comment on column public.estimates.deposit_failed_at is
  'When the last deposit attempt was rejected. Cleared once a deposit is recorded. Non-null + deposit_collected_cents = 0 is what re-opens the proposal link for a retry.';
comment on column public.estimates.deposit_failed_reason is
  'Stripe''s human-readable decline/return message, shown to staff and (verbatim) to the client on the retry screen.';
