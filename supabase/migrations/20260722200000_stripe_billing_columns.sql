-- ═══════════════════════════════════════════════════════════════════════════════
-- Stripe billing columns on organizations
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN stripe_customer_id text UNIQUE,
  ADD COLUMN stripe_subscription_id text,
  ADD COLUMN stripe_price_id text,
  ADD COLUMN stripe_subscription_status text
    CHECK (stripe_subscription_status IN (
      'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    ));

-- `admins_update_own_org` lets any org member update arbitrary columns on
-- their own organizations row from the browser (see initial_schema.sql).
-- Stripe state must only ever change via the webhook / checkout routes,
-- which write through the service-role client. Any other writer has its
-- changes to these columns (and `plan`, which now mirrors subscription
-- state) silently reverted to the previous value instead of erroring, so
-- unrelated fields in the same update (name, brand_color, etc.) still save.
CREATE OR REPLACE FUNCTION public.protect_stripe_billing_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan                       := OLD.plan;
    NEW.stripe_customer_id         := OLD.stripe_customer_id;
    NEW.stripe_subscription_id     := OLD.stripe_subscription_id;
    NEW.stripe_price_id            := OLD.stripe_price_id;
    NEW.stripe_subscription_status := OLD.stripe_subscription_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_stripe_billing_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_stripe_billing_columns();
