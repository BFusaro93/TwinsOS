-- Stripe's own "ACH Direct Debit" dashboard toggle governs automatic-payment-method
-- detection (Checkout, automatic_payment_methods), not the explicit payment_method_types
-- array this app always uses — so it doesn't actually gate anything here, and in test
-- mode Stripe reports the underlying capability as active regardless of that toggle.
-- This gives the org a real, predictable switch for whether ACH is offered at all.
ALTER TABLE public.organizations
  ADD COLUMN ach_payments_enabled boolean NOT NULL DEFAULT false;
