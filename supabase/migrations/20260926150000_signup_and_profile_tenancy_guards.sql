-- Tenancy / privilege guards found in the 9/26 sweep.
--
-- 1. handle_new_user trusted org_id AND role from raw_user_meta_data, which a
--    public supabase.auth.signUp() call controls. Anyone who knew an org id
--    could sign up straight into that org as admin. Now:
--      * invited users (invited_at set — only the service-role invite route
--        can produce that) keep the org/role the server put in metadata;
--      * a self-signup only gets a profile when it is founding a brand-new
--        org (created in the last day, no confirmed member yet), and the role
--        is forced to admin rather than read from metadata;
--      * anything else gets no profile (crew accounts are created by the
--        service role, which upserts its own profile row).
--
-- 2. users_update_own_profile has no column restriction and the role guard
--    only covered role/org_id, so a user could grant themselves
--    photo_module_access, flip their own status, or rewrite their email.
--
-- 3. Nothing stopped the last active admin being demoted/deactivated, after
--    which prevent_profile_role_escalation blocks everyone from promoting
--    anyone back.
--
-- 4. protect_stripe_billing_columns left the seat-override, trial and
--    oauth_write_roles columns writable by anyone with company/crm settings
--    permission (bypassing syncSeatOverage and the admin-only
--    /api/settings/oauth-write-roles route).

-- ── 1. signup trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
BEGIN
  IF (NEW.raw_user_meta_data ->> 'portal') = 'true' THEN
    RETURN NEW;
  END IF;

  IF (NEW.raw_user_meta_data ->> 'org_id') IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_org_id := (NEW.raw_user_meta_data ->> 'org_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NEW;
  END;

  IF NEW.invited_at IS NOT NULL THEN
    -- Service-role invite: metadata was written by /api/users/invite.
    INSERT INTO public.profiles (id, org_id, name, email, role, status)
    VALUES (
      NEW.id,
      v_org_id,
      COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      COALESCE(NEW.raw_user_meta_data ->> 'role', 'viewer'),
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Self-signup: only the founder of an org /api/orgs/create just made.
  IF EXISTS (
       SELECT 1 FROM public.organizations o
       WHERE o.id = v_org_id AND o.created_at > now() - interval '1 day'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.org_id = v_org_id AND u.email_confirmed_at IS NOT NULL
     )
  THEN
    INSERT INTO public.profiles (id, org_id, name, email, role, status)
    VALUES (
      NEW.id,
      v_org_id,
      COALESCE(NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
      NEW.email,
      'admin',
      'active'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- ── 2 + 3. profile self-edit + last-admin guard ─────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
  v_is_service  boolean := auth.role() = 'service_role' or v_caller_id is null;
  v_auth_email  text;
begin
  if new.org_id is distinct from old.org_id and auth.role() is distinct from 'service_role' then
    raise exception 'org_id cannot be changed directly';
  end if;

  if not v_is_service then
    select role into v_caller_role from public.profiles where id = v_caller_id;
  end if;

  if new.role is distinct from old.role and not v_is_service then
    if v_caller_role is distinct from 'admin' then
      raise exception 'Only an admin may change role on a profile';
    end if;
  end if;

  if not v_is_service and v_caller_role is distinct from 'admin' then
    if new.photo_module_access is distinct from old.photo_module_access then
      raise exception 'Only an admin may change Job Photos access';
    end if;

    -- The one self-service status change: first sign-in of an invited user.
    if new.status is distinct from old.status
       and not (old.status = 'invited' and new.status = 'active' and new.id = v_caller_id) then
      raise exception 'Only an admin may change a user''s status';
    end if;

    -- Email may only be synced to the address auth actually verified.
    if new.email is distinct from old.email then
      select email into v_auth_email from auth.users where id = new.id;
      if new.id is distinct from v_caller_id or new.email is distinct from v_auth_email then
        raise exception 'Profile email can only be changed by changing the sign-in email';
      end if;
    end if;
  end if;

  -- Never leave an org without an active admin (applies to service role too:
  -- the deactivate route runs as service role).
  if old.role = 'admin' and old.status = 'active'
     and (new.role is distinct from 'admin' or new.status is distinct from 'active')
     and not exists (
       select 1 from public.profiles p
       where p.org_id = old.org_id and p.id <> old.id
         and p.role = 'admin' and p.status = 'active'
     )
  then
    raise exception 'This is the last active admin — promote another admin first';
  end if;

  return new;
end;
$function$;

-- ── 4. org billing / oauth columns ──────────────────────────────────────────
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
    NEW.stripe_connect_account_id   := OLD.stripe_connect_account_id;
    NEW.stripe_connect_status       := OLD.stripe_connect_status;
    NEW.stripe_connect_charges_enabled := OLD.stripe_connect_charges_enabled;
    NEW.stripe_connect_payouts_enabled := OLD.stripe_connect_payouts_enabled;
    NEW.stripe_connect_livemode     := OLD.stripe_connect_livemode;

    -- oauth_write_roles decides which roles can mint MCP write scopes; the
    -- settings UI for it is admin-only, so enforce that here too.
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
