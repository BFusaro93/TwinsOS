-- QuickBooks sync Phase 3: invoice + payment push. Mirrors the
-- clients.qbo_customer_id / crm_payments.stripe_payment_intent_id precedent
-- (external-system ID stored directly on the row, not a mapping table).
-- qbo_payment_id lives on crm_payment_allocations, not crm_payments,
-- because a single TwinsOS payment split across multiple invoices becomes
-- one QBO Payment per allocation (decided with the user).
ALTER TABLE public.crm_invoices ADD COLUMN IF NOT EXISTS qbo_invoice_id text;
CREATE UNIQUE INDEX IF NOT EXISTS crm_invoices_qbo_invoice_id_idx
  ON public.crm_invoices (qbo_invoice_id) WHERE qbo_invoice_id IS NOT NULL;

ALTER TABLE public.crm_payment_allocations ADD COLUMN IF NOT EXISTS qbo_payment_id text;
CREATE UNIQUE INDEX IF NOT EXISTS crm_payment_allocations_qbo_payment_id_idx
  ON public.crm_payment_allocations (qbo_payment_id) WHERE qbo_payment_id IS NOT NULL;
