-- A deactivated employee (crm_employees.is_active = false) kept every role
-- permission and CRM-wide RLS access: has_crm_access() and
-- has_settings_permission() looked for a live (non-deleted) employee->role link
-- and never checked is_active, so "Deactivate" only hid them from pickers.
-- Both helpers now require is_active. Admins and crew accounts are unaffected
-- (crew access is governed by its own narrower policies).
create or replace function public.has_crm_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    (select role from public.profiles where id = auth.uid()) in ('admin', 'crew')
    or exists (
      select 1
      from public.crm_employees ce
      join public.crm_roles cr on cr.id = ce.crm_role_id
      where ce.user_id = auth.uid()
        and ce.deleted_at is null
        and ce.is_active
        and cr.deleted_at is null
    );
$$;

create or replace function public.has_settings_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_permissions jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'admin' then
    return true;
  end if;

  select cr.permissions into v_permissions
  from public.crm_employees ce
  join public.crm_roles cr on cr.id = ce.crm_role_id
  where ce.user_id = auth.uid()
    and ce.deleted_at is null
    and ce.is_active
    and cr.deleted_at is null;

  if v_permissions is null then
    return false;
  end if;

  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$$;
