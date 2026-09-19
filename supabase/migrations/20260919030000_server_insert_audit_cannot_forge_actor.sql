-- ─────────────────────────────────────────────────────────────────────────────
-- server_insert_audit must not let a caller name someone else as the actor.
--
-- 20260918220000 closed the direct INSERT path into audit_log, but this
-- SECURITY DEFINER function is a second door to the same room: it is granted
-- to `authenticated`, and it takes BOTH p_created_by and p_user_name from the
-- caller, validating only the org. Any signed-in member could therefore still
-- write an entry attributed to anyone in their organization — precisely the
-- forgery the other change was meant to end.
--
-- Revoking the grant is not an option: the one caller
-- (/api/crm/invoices/merge) uses the cookie-based RLS client, so it runs as
-- `authenticated` rather than the service role.
--
-- Instead the function now derives the actor itself whenever there IS an
-- authenticated user, and only trusts the passed-in identity when there is
-- none (a service-role or background caller, which is what those parameters
-- were added for). The existing caller already passes the real session user,
-- so its entries are unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.server_insert_audit(
  p_org_id      uuid,
  p_record_type text,
  p_record_id   uuid,
  p_action      text,
  p_description text,
  p_created_by  uuid DEFAULT NULL::uuid,
  p_user_name   text DEFAULT 'System'::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_created_by uuid;
  v_user_name  text;
begin
  if v_uid is not null and p_org_id is distinct from public.my_org_id() then
    raise exception 'Cannot write an audit entry for another organization'
      using errcode = 'insufficient_privilege';
  end if;

  if v_uid is not null then
    -- A signed-in caller is the actor, whatever it claims in the arguments.
    v_created_by := v_uid;
    select coalesce(name, email, id::text) into v_user_name
      from public.profiles where id = v_uid;
    v_user_name := coalesce(v_user_name, 'system');
  else
    -- No session: a service-role or background caller, which is the case
    -- these parameters exist for.
    v_created_by := p_created_by;
    v_user_name  := coalesce(p_user_name, 'system');
  end if;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description
  ) values (
    p_org_id, v_created_by, p_record_type, p_record_id, p_action,
    v_user_name, p_description
  );
end;
$function$;

revoke execute on function public.server_insert_audit(uuid, text, uuid, text, text, uuid, text) from public, anon;
grant  execute on function public.server_insert_audit(uuid, text, uuid, text, text, uuid, text) to authenticated, service_role;
