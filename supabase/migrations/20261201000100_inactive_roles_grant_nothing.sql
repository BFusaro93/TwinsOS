-- An inactive role (crm_roles.is_active = false) must grant nothing. Both RLS
-- helpers only checked cr.deleted_at, so deactivating a role in Settings did
-- not revoke access. Re-stated in full from 20261023100000 (create or replace
-- keeps the existing grants/revokes); the only change is `and cr.is_active`.
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
        and cr.is_active
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
    and cr.deleted_at is null
    and cr.is_active;

  if v_permissions is null then
    return false;
  end if;

  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$$;

-- DB-level guard: a role that live employees still hold cannot be soft-deleted
-- (the client checks too, but RLS-permitted direct updates bypassed it).
create or replace function public.crm_roles_block_delete_when_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assigned integer;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    select count(*) into v_assigned
    from public.crm_employees ce
    where ce.crm_role_id = old.id
      and ce.deleted_at is null;
    if v_assigned > 0 then
      raise exception '% employee(s) are still assigned to this role. Reassign them to another role first.', v_assigned
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_roles_block_delete_when_assigned on public.crm_roles;
create trigger crm_roles_block_delete_when_assigned
  before update on public.crm_roles
  for each row execute function public.crm_roles_block_delete_when_assigned();
