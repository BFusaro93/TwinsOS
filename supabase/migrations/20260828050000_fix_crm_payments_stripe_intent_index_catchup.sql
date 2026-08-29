-- 20260723034900_crm_card_payment_processing.sql rolled back in full on an
-- environment where organizations.cc_processing_fee_enabled had already
-- been added out-of-band, so the unique index preventing duplicate payment
-- records from a retried Stripe webhook delivery never got created there.
-- Safe to re-run anywhere via IF NOT EXISTS.
CREATE UNIQUE INDEX IF NOT EXISTS crm_payments_stripe_payment_intent_id_idx
  ON public.crm_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
