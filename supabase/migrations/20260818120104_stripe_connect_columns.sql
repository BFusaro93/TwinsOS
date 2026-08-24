-- ═══════════════════════════════════════════════════════════════════════════════
-- Stripe Connect columns on organizations — per-tenant payouts for Landscapt
-- card payments (crm_payments). Separate Stripe platform account from the
-- one used for subscription billing (stripe_customer_id etc. above).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN stripe_connect_account_id text UNIQUE,
  ADD COLUMN stripe_connect_status text NOT NULL DEFAULT 'not_started'
    CHECK (stripe_connect_status IN ('not_started', 'pending', 'active', 'restricted')),
  ADD COLUMN stripe_connect_charges_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN stripe_connect_payouts_enabled boolean NOT NULL DEFAULT false;

-- Extend the existing Stripe-column protection trigger (see
-- 20260722200000_stripe_billing_columns.sql) to cover the Connect columns too —
-- they must only ever change via the onboarding route / connect webhook, both
-- of which write through the service-role client.
CREATE OR REPLACE FUNCTION public.protect_stripe_billing_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan                            := OLD.plan;
    NEW.stripe_customer_id              := OLD.stripe_customer_id;
    NEW.stripe_subscription_id          := OLD.stripe_subscription_id;
    NEW.stripe_price_id                 := OLD.stripe_price_id;
    NEW.stripe_subscription_status      := OLD.stripe_subscription_status;
    NEW.stripe_connect_account_id       := OLD.stripe_connect_account_id;
    NEW.stripe_connect_status           := OLD.stripe_connect_status;
    NEW.stripe_connect_charges_enabled  := OLD.stripe_connect_charges_enabled;
    NEW.stripe_connect_payouts_enabled  := OLD.stripe_connect_payouts_enabled;
  END IF;
  RETURN NEW;
END;
$$;
