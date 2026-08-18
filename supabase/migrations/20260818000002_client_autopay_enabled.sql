-- Saving a card/bank account on file (saved_payment_method_*) and enrolling that
-- client in the automatic "Invoices to Charge" / "ACH Invoices to Charge" queues
-- are separate decisions — a client can have a card on file purely for staff to
-- charge on demand, without being swept up by the autopay queue's "Charge All".
ALTER TABLE public.clients
  ADD COLUMN autopay_enabled boolean NOT NULL DEFAULT true;
