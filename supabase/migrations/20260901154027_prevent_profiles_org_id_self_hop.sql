-- SECURITY FIX: prevent_profile_role_escalation() blocked role/org_id
-- changes unless the CALLER is an admin — but never checked that the
-- caller was an admin of the SAME org being assigned, nor restricted
-- org_id changes to a legitimate flow at all. profiles RLS policy
-- users_update_own_profile (USING id = auth.uid(), no separate WITH CHECK,
-- so USING doubles as the check on the new row — and USING only
-- constrains `id`, not `org_id`) let any customer-org admin run
-- `UPDATE profiles SET org_id = '<any-other-org>' WHERE id = auth.uid()`
-- against their own row and pass both RLS and this trigger, instantly
-- becoming a full member of an arbitrary target org with no impersonation
-- session, no expiry, no audit trail.
--
-- org_id is set once at profile creation (invite/signup) and the app has
-- no legitimate flow that changes an existing profile's org_id via a
-- client-authenticated UPDATE (grepped every hook/route — only role
-- changes go through useUpdateUserRole). Lock org_id changes to
-- service_role only; role changes by an org admin remain allowed exactly
-- as before.
create or replace function public.prevent_profile_role_escalation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
begin
  if new.org_id is distinct from old.org_id and auth.role() is distinct from 'service_role' then
    raise exception 'org_id cannot be changed directly';
  end if;

  if new.role is distinct from old.role then
    if v_caller_id is null then
      return new;
    end if;

    select role into v_caller_role from public.profiles where id = v_caller_id;

    if v_caller_role is distinct from 'admin' then
      raise exception 'Only an admin may change role on a profile';
    end if;
  end if;

  return new;
end;
$function$;
