-- 20260723013523_stripe_billing_columns.sql rolled back in full on an
-- environment where organizations.stripe_customer_id had already been added
-- out-of-band, so the protect_stripe_billing_columns() trigger — which
-- guards these columns from non-service-role writers — never actually got
-- created there. CREATE OR REPLACE FUNCTION and DROP+CREATE TRIGGER are
-- both safe to re-run anywhere, including where the original migration
-- already fully succeeded.
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

DROP TRIGGER IF EXISTS trg_protect_stripe_billing_columns ON public.organizations;

CREATE TRIGGER trg_protect_stripe_billing_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.protect_stripe_billing_columns();
