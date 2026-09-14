-- 20260824113940_crm_roles_admin_only_writes.sql rolled back in full on an
-- environment where "admins can insert roles" already existed (created
-- out-of-band, matching the same drift as everything else here), so the
-- rest of that migration's privilege-escalation fix — the update policy,
-- the crm_employees insert restriction, and the crm_role_id-change trigger
-- — never got verified as actually present. This is a real security
-- control (prevents a non-admin from forging their own elevated
-- permissions), so re-running it idempotently rather than assuming it's
-- fine is the safer path. Every statement here is drop-if-exists +
-- (re)create, safe to run regardless of current state.

drop policy if exists "org members can insert roles" on public.crm_roles;
drop policy if exists "admins can insert roles" on public.crm_roles;
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
drop policy if exists "admins can update roles" on public.crm_roles;
create policy "admins can update roles" on public.crm_roles
  for update
  using (
    org_id = public.my_org_id()
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
    )
  );

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
