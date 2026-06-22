-- Invoice lock state + preferred payment method
ALTER TABLE public.crm_invoices
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS preferred_payment_method text;

-- Client default payment method
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_payment_method text;
