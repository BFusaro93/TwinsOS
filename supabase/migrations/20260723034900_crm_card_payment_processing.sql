-- ═══════════════════════════════════════════════════════════════════════════════
-- Integrated credit-card payments for CRM invoices
-- ═══════════════════════════════════════════════════════════════════════════════

-- Org-level config for the optional credit-card processing fee, mirroring the
-- existing tax_rate_percent pattern. Stored in bps (basis points) to match
-- the CRM module's convention (crm_invoices.tax_rate_bps, clients.default_tax_rate_bps)
-- rather than PO/CMMS's plain-percent tax_rate_percent.
ALTER TABLE public.organizations
  ADD COLUMN cc_processing_fee_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN cc_processing_fee_bps integer NOT NULL DEFAULT 350
    CHECK (cc_processing_fee_bps >= 0 AND cc_processing_fee_bps <= 10000),
  ADD COLUMN cc_processing_fee_threshold_cents integer NOT NULL DEFAULT 50000
    CHECK (cc_processing_fee_threshold_cents >= 0);

-- stripe_payment_intent_id: idempotency key so a retried webhook delivery for
-- the same PaymentIntent can't create a duplicate payment record. Unique only
-- when set (manual/non-card payments leave it null).
ALTER TABLE public.crm_payments
  ADD COLUMN stripe_payment_intent_id text,
  ADD COLUMN processing_fee_cents integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX crm_payments_stripe_payment_intent_id_idx
  ON public.crm_payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
