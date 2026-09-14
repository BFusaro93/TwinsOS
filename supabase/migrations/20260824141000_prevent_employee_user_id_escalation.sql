-- 20260824113940_crm_roles_admin_only_writes.sql correctly locked down
-- changing crm_employees.crm_role_id to admins only, since
-- usePermissions() resolves a user's permissions by looking up
-- crm_employees BY user_id and reading that row's crm_role_id. But it
-- missed that user_id itself is an equally exploitable escalation vector
-- into the exact same resolution path: any org member with ordinary
-- emp_edit permission could unlink their own crm_employees row (clearing
-- user_id to satisfy the partial unique index), then relink their own auth
-- user_id onto a DIFFERENT, higher-privilege employee's row — inheriting
-- that row's crm_role_id without ever touching the guarded column.
--
-- Extend the same trigger to require an admin caller whenever user_id
-- changes too (service-role sessions are trusted the same way
-- crm_role_id already is — the calling API route already verified admin
-- status before using the admin client).
create or replace function public.prevent_crm_role_id_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_id   uuid := auth.uid();
  v_caller_role text;
begin
  if (new.crm_role_id is distinct from old.crm_role_id)
     or (new.user_id is distinct from old.user_id) then
    if v_caller_id is null then
      -- Service-role session — the calling API route already verified
      -- the caller's admin status before using the admin client.
      return new;
    end if;

    select role into v_caller_role from public.profiles where id = v_caller_id;

    if v_caller_role is distinct from 'admin' then
      raise exception 'Only an admin may change an employee''s assigned role or linked user';
    end if;
  end if;

  return new;
end;
$$;
