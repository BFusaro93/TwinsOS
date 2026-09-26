-- A canceled/unpaid subscription used to drop the org back to plan='trial',
-- which getModulesForPlan/planIncludesAddon treat as full access — cancel and
-- keep everything for free. Now it moves to plan='canceled': the org keeps
-- READ-ONLY access until canceled_access_ends_at (90 days), then the app
-- locks it out like an expired trial. Resubscribing (the billing webhook sets
-- a billable plan) clears it.
--
-- Read-only is enforced in the DB with RESTRICTIVE insert/update/delete
-- policies on every org-scoped table that already has a permissive policy
-- (tables with none are deny-all by design and are left alone — see the
-- security advisor baseline). Service-role code (Stripe webhooks, crons)
-- bypasses RLS, so billing can still flip the org back. support_messages and
-- notifications stay writable so the org can still reach support and clear
-- its notifications.
--
-- New org-scoped tables do NOT pick this up automatically — re-run the DO
-- block (it is idempotent) or add the three policies by hand.

-- 'cmms' (the Equipt plan in src/lib/stripe/plans.ts) was never in this
-- constraint, so an Equipt subscription's webhook update would have failed.
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_plan_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_check
  CHECK (plan = ANY (ARRAY['trial', 'cmms', 'starter', 'growth', 'enterprise', 'canceled']));

ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS canceled_access_ends_at timestamptz;

CREATE OR REPLACE FUNCTION public.my_org_is_read_only()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce((SELECT plan = 'canceled' FROM public.organizations WHERE id = my_org_id()), false);
$$;
REVOKE ALL ON FUNCTION public.my_org_is_read_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_org_is_read_only() TO authenticated;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
     WHERE c.relnamespace = 'public'::regnamespace
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.permissive = 'PERMISSIVE')
       AND c.relname NOT IN ('support_messages', 'notifications')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_ins ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.%I', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS read_only_when_canceled_del ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY read_only_when_canceled_ins ON public.%I AS RESTRICTIVE FOR INSERT
                    WITH CHECK ((SELECT my_org_is_read_only()) IS NOT TRUE)', t.relname);
    EXECUTE format('CREATE POLICY read_only_when_canceled_upd ON public.%I AS RESTRICTIVE FOR UPDATE
                    USING ((SELECT my_org_is_read_only()) IS NOT TRUE)', t.relname);
    EXECUTE format('CREATE POLICY read_only_when_canceled_del ON public.%I AS RESTRICTIVE FOR DELETE
                    USING ((SELECT my_org_is_read_only()) IS NOT TRUE)', t.relname);
  END LOOP;
END $$;

-- organizations itself has no org_id column; block settings writes too.
DROP POLICY IF EXISTS read_only_when_canceled_upd ON public.organizations;
CREATE POLICY read_only_when_canceled_upd ON public.organizations AS RESTRICTIVE FOR UPDATE
  USING ((SELECT my_org_is_read_only()) IS NOT TRUE);

-- Keep the new column service-role-only alongside the other billing columns
-- (re-states 20260926150000's version in full).
CREATE OR REPLACE FUNCTION public.protect_stripe_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan                        := OLD.plan;
    NEW.stripe_customer_id          := OLD.stripe_customer_id;
    NEW.stripe_subscription_id      := OLD.stripe_subscription_id;
    NEW.stripe_price_id             := OLD.stripe_price_id;
    NEW.stripe_subscription_status  := OLD.stripe_subscription_status;
    NEW.is_platform_staff_org       := OLD.is_platform_staff_org;
    NEW.seats_included_override     := OLD.seats_included_override;
    NEW.seat_overage_cents_override := OLD.seat_overage_cents_override;
    NEW.trial_ends_at               := OLD.trial_ends_at;
    NEW.canceled_access_ends_at     := OLD.canceled_access_ends_at;
    NEW.stripe_connect_account_id   := OLD.stripe_connect_account_id;
    NEW.stripe_connect_status       := OLD.stripe_connect_status;
    NEW.stripe_connect_charges_enabled := OLD.stripe_connect_charges_enabled;
    NEW.stripe_connect_payouts_enabled := OLD.stripe_connect_payouts_enabled;
    NEW.stripe_connect_livemode     := OLD.stripe_connect_livemode;

    IF NEW.oauth_write_roles IS DISTINCT FROM OLD.oauth_write_roles
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles
         WHERE id = auth.uid() AND org_id = OLD.id AND role = 'admin' AND status = 'active'
       )
    THEN
      NEW.oauth_write_roles := OLD.oauth_write_roles;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
