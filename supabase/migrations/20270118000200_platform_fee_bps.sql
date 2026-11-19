-- Platform application fee on Stripe charges (per organization).
--
-- Every card / ACH charge is a direct charge on the org's connected account, so
-- the platform's cut is the PaymentIntent's application_fee_amount (CARD charges
-- only; ACH carries no platform fee). This column
-- is the rate, in basis points of the amount charged (10 bps = 0.1%).
--
-- Rollout: every EXISTING org is grandfathered at 0 (no new fee). New orgs
-- default to 10 bps. A negotiated rate is just an update to this column.
--
-- Staff-only: the rate is a commercial term, so an org admin (even with every
-- settings permission) must not be able to change their own. The column is
-- guarded by a trigger rather than by editing guard_org_settings_columns(), so
-- the two guards stay independent. Service role / no-JWT database calls are
-- exempt (the staff API route writes with the service role after its own
-- is_staff() check).

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS platform_fee_bps integer NOT NULL DEFAULT 0;

-- Existing rows were just backfilled with 0 by the ADD COLUMN default; only
-- rows created from now on get 10.
ALTER TABLE public.organizations
  ALTER COLUMN platform_fee_bps SET DEFAULT 10;

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_platform_fee_bps_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_platform_fee_bps_check
  CHECK (platform_fee_bps >= 0 AND platform_fee_bps <= 100);

COMMENT ON COLUMN public.organizations.platform_fee_bps IS
  'Platform application fee on Stripe charges, in basis points of the amount charged (10 = 0.1%). Staff-only.';

CREATE OR REPLACE FUNCTION public.guard_org_platform_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR coalesce(auth.role(), '') = 'service_role'
     OR pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF NEW.platform_fee_bps IS DISTINCT FROM OLD.platform_fee_bps
     AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform staff can change the payment platform fee.'
      USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_org_platform_fee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_org_platform_fee ON public.organizations;
CREATE TRIGGER guard_org_platform_fee
  BEFORE UPDATE OF platform_fee_bps ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_platform_fee();

-- What the platform actually collected on a payment (Stripe's application fee),
-- for per-org revenue reporting. Written by the Stripe recorder; 0 for payments
-- that carried no fee (manual payments, grandfathered orgs).
ALTER TABLE public.crm_payments
  ADD COLUMN IF NOT EXISTS platform_fee_cents integer NOT NULL DEFAULT 0;
