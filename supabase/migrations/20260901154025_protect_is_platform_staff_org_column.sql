-- SECURITY FIX: organizations.is_platform_staff_org had no column-level
-- protection. RLS policy settings_permission_update_org allows any org
-- admin (has_settings_permission('company_settings') returns true for
-- role='admin' unconditionally) to UPDATE their own organizations row with
-- no WITH CHECK — and since is_staff()/is_platform_staff_org gates the
-- entire staff-impersonation system (any member of a staff org can open an
-- impersonation session targeting ANY other org's id, per
-- staff_impersonation_sessions' INSERT policy), any customer-org admin
-- could self-promote their own org to is_platform_staff_org = true and gain
-- full read/write impersonation access to every tenant.
--
-- Same root cause the Stripe billing columns were already protected against
-- via protect_stripe_billing_columns()/trg_protect_stripe_billing_columns
-- (a sensitive column reachable through an otherwise-legitimate row-level
-- UPDATE grant, with no column-level guard) — extend that same trigger to
-- cover this column too, rather than adding a second trigger.
create or replace function public.protect_stripe_billing_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    NEW.plan                       := OLD.plan;
    NEW.stripe_customer_id         := OLD.stripe_customer_id;
    NEW.stripe_subscription_id     := OLD.stripe_subscription_id;
    NEW.stripe_price_id            := OLD.stripe_price_id;
    NEW.stripe_subscription_status := OLD.stripe_subscription_status;
    NEW.is_platform_staff_org      := OLD.is_platform_staff_org;
  END IF;
  RETURN NEW;
END;
$function$;
