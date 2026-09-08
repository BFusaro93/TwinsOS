-- Marks an invoice as having a payment already in flight.
--
-- An ACH debit confirms as `processing` and only settles days later. Nothing is
-- written to crm_payments until it does — deliberately, since every row in that
-- table is a settled payment that moves the balance — so the invoice keeps its
-- full balance and keeps sitting in the "ACH To Charge" queue for the whole
-- settlement period with nothing to distinguish it from an invoice nobody has
-- touched. Staff working the queue again the next day would submit a second
-- debit for the same invoice.
--
-- The server-side duplicate guard (src/lib/stripe/duplicate-charge.ts) already
-- refuses that charge, but refusing it is a poor substitute for not offering it:
-- these columns let the queue show the invoice as pending, keep it out of
-- "Charge All", and tell staff how much is coming and when it was submitted.
--
-- Cleared when the intent settles (the Connect webhook records the payment) or
-- fails. Keyed on the PaymentIntent id so clearing is idempotent and can never
-- clobber a newer marker belonging to a different intent.

alter table crm_invoices
  add column if not exists pending_payment_intent_id text,
  add column if not exists pending_payment_cents integer,
  add column if not exists pending_payment_method text,
  add column if not exists pending_payment_at timestamptz;

-- Clearing looks the row up by intent id, and the queue filters on presence.
create index if not exists crm_invoices_pending_payment_intent_idx
  on crm_invoices (pending_payment_intent_id)
  where pending_payment_intent_id is not null;

comment on column crm_invoices.pending_payment_intent_id is
  'Stripe PaymentIntent still in flight against this invoice (ACH processing, or a card awaiting action). Null once it settles or fails. Not a payment record — crm_payments only ever holds settled money.';

notify pgrst, 'reload schema';
