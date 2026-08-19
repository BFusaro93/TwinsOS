-- ═══════════════════════════════════════════════════════════════════════════════
-- Per-product (Equipt / Landscapt) billing columns on organizations
--
-- Billing used to be one org-wide plan/subscription. Equipt and Landscapt are
-- now separately purchasable (and still purchasable together), so each product
-- gets its own plan/status/price tracked independently. The legacy `plan` /
-- `stripe_subscription_status` / `stripe_subscription_id` / `stripe_price_id`
-- columns are left in place for any pre-existing single-product subscription
-- created before this migration; new subscriptions are tagged with a `product`
-- metadata key on the Stripe subscription and recorded in the columns below.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN equipt_plan text NOT NULL DEFAULT 'trial'
    CHECK (equipt_plan IN ('trial', 'starter', 'growth', 'enterprise')),
  ADD COLUMN equipt_stripe_subscription_id text,
  ADD COLUMN equipt_stripe_price_id text,
  ADD COLUMN equipt_stripe_subscription_status text
    CHECK (equipt_stripe_subscription_status IN (
      'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    )),
  ADD COLUMN landscapt_plan text NOT NULL DEFAULT 'trial'
    CHECK (landscapt_plan IN ('trial', 'starter', 'growth', 'enterprise')),
  ADD COLUMN landscapt_stripe_subscription_id text,
  ADD COLUMN landscapt_stripe_price_id text,
  ADD COLUMN landscapt_stripe_subscription_status text
    CHECK (landscapt_stripe_subscription_status IN (
      'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    ));

-- Extend the existing Stripe-billing-columns write guard (see
-- 20260722200000_stripe_billing_columns.sql) to also cover the new per-product
-- columns — same reasoning: these must only ever change via the webhook /
-- checkout routes (service-role client), not an ordinary authenticated update.
CREATE OR REPLACE FUNCTION public.protect_stripe_billing_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan                                := OLD.plan;
    NEW.stripe_customer_id                  := OLD.stripe_customer_id;
    NEW.stripe_subscription_id              := OLD.stripe_subscription_id;
    NEW.stripe_price_id                     := OLD.stripe_price_id;
    NEW.stripe_subscription_status          := OLD.stripe_subscription_status;
    NEW.equipt_plan                         := OLD.equipt_plan;
    NEW.equipt_stripe_subscription_id       := OLD.equipt_stripe_subscription_id;
    NEW.equipt_stripe_price_id              := OLD.equipt_stripe_price_id;
    NEW.equipt_stripe_subscription_status   := OLD.equipt_stripe_subscription_status;
    NEW.landscapt_plan                       := OLD.landscapt_plan;
    NEW.landscapt_stripe_subscription_id     := OLD.landscapt_stripe_subscription_id;
    NEW.landscapt_stripe_price_id            := OLD.landscapt_stripe_price_id;
    NEW.landscapt_stripe_subscription_status := OLD.landscapt_stripe_subscription_status;
  END IF;
  RETURN NEW;
END;
$$;
