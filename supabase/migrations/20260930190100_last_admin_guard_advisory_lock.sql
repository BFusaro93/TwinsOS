-- Last-admin guard race (20260926150000): two concurrent demotions /
-- deactivations of the only two active admins could each see the OTHER still
-- active in the NOT EXISTS check and both commit, leaving the org with no
-- active admin. The guard now takes a per-org transaction-scoped advisory
-- lock first, so the second transaction waits for the first to commit and
-- then sees its result.
--
-- Re-stated in full from 20260926150000 (the latest definition); the only
-- change is the pg_advisory_xact_lock call.
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
  then
    -- Serialize admin removals per org (released at commit/rollback).
    perform pg_advisory_xact_lock(hashtext(old.org_id::text));
  end if;

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
