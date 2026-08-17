-- crm_roles (the CRM's granular permission-set table — src/lib/hooks/use-permissions.ts
-- resolves every PermissionGate check in the CRM from
-- crm_employees.crm_role_id -> crm_roles.permissions) allowed ANY org
-- member to insert or update a role row:
--   create policy "org members can insert roles" on crm_roles
--     for insert with check (org_id = my_org_id());
--   create policy "org members can update roles" on crm_roles
--     for update using (org_id = my_org_id());
-- and crm_employees allowed any org member to update ANY column, including
-- crm_role_id:
--   create policy "org members can update employees" on crm_employees
--     for update using (org_id = my_org_id());
-- Together, any authenticated org member could insert a crm_roles row with
-- every permission flag set true, point their own (or anyone's)
-- crm_employees.crm_role_id at it, and immediately gain every CRM
-- permission (billing, refunds, reports, contract management) — the
-- PermissionGate checks this data drives are client-side only and cannot
-- defend against the data itself being forged.
--
-- Fix: writes to crm_roles (the permission definitions) require the caller
-- to already be an org admin (profiles.role = 'admin' — the one privilege
-- tier that isn't itself sourced from this same forgeable table). Changing
-- crm_role_id on crm_employees (the assignment of a role to a person) is
-- likewise restricted to admins via a trigger, while other employee fields
-- (name, phone, etc.) remain editable by whoever the existing
-- emp_edit/emp_manage permission already allowed.

drop policy if exists "org members can insert roles" on public.crm_roles;
create policy "admins can insert roles" on public.crm_roles
  for insert
  with check (
    org_id = public.my_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

drop policy if exists "org members can update roles" on public.crm_roles;
create policy "admins can update roles" on public.crm_roles
  for update
  using (
    org_id = public.my_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

-- "org members can insert employees" (with check (org_id = my_org_id()))
-- also let any org member insert a brand-new crm_employees row for
-- themselves with an arbitrary crm_role_id set directly — restrict that
-- the same way: a non-null crm_role_id on insert requires an admin caller.
drop policy if exists "org members can insert employees" on public.crm_employees;
create policy "org members can insert employees" on public.crm_employees
  for insert
  with check (
    org_id = public.my_org_id()
    and (
      crm_role_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  );

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
  if new.crm_role_id is distinct from old.crm_role_id then
    if v_caller_id is null then
      -- Service-role session — the calling API route already verified
      -- the caller's admin status before using the admin client.
      return new;
    end if;

    select role into v_caller_role from public.profiles where id = v_caller_id;

    if v_caller_role is distinct from 'admin' then
      raise exception 'Only an admin may change an employee''s assigned role';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_crm_role_id_escalation on public.crm_employees;
create trigger trg_prevent_crm_role_id_escalation
  before update on public.crm_employees
  for each row execute function public.prevent_crm_role_id_escalation();
