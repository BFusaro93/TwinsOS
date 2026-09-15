-- A proposal deposit paid by ACH is submitted now and settles days later.
--
-- crm_payments only ever holds settled money, so nothing is written for an ACH
-- deposit until Stripe confirms it. Without a marker the estimate looks exactly
-- like one where the client skipped the deposit: deposit_collected_cents = 0,
-- no payment, nothing to chase. Staff would have no way to tell "they paid,
-- it's clearing" from "they never paid".
--
-- Same shape and the same reasoning as crm_invoices.pending_payment_*
-- (20260908120000), which exists for exactly this on the invoice side.
--
-- The acceptance itself is NOT held up by this: a signed proposal shouldn't
-- wait three business days on a bank debit, so the estimate is accepted as
-- soon as the debit is submitted and this marker records that the money is on
-- its way. It is set on payment_intent.processing, and cleared on
-- succeeded (where the real prepayment is written instead), payment_failed and
-- canceled.
alter table public.estimates
  add column if not exists deposit_pending_intent_id text,
  add column if not exists deposit_pending_cents     integer,
  add column if not exists deposit_pending_method    text,
  add column if not exists deposit_pending_at        timestamptz;

comment on column public.estimates.deposit_pending_intent_id is
  'Stripe PaymentIntent for a deposit that has been submitted but has not settled (ACH). Cleared once it succeeds, fails or is canceled.';

-- Cleared by matching on the intent id, so the lookup wants an index rather
-- than a scan of every estimate.
create index if not exists estimates_deposit_pending_intent_idx
  on public.estimates(deposit_pending_intent_id)
  where deposit_pending_intent_id is not null;
