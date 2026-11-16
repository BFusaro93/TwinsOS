-- Round 14 (access F1): a login's Landscapt role must come from an employee
-- record in the login's OWN org.
--
-- has_crm_access() / has_settings_permission() resolved crm_employees by
-- user_id alone, and nothing stopped an admin of org B from inserting an
-- employee row in B that points at a login of org A. That login then carried
-- B's role into org A (every permission key, CRM access, pay data).
--
-- 1. The helpers now require the employee row to be in the caller's HOME org
--    (profiles.org_id, not my_org_id(), so platform staff keep their own role
--    while impersonating; staff admins pass on profile role anyway).
-- 2. report_user_has_permission() and my_crew_ids() get the same org match.
-- 3. A BEFORE trigger on crm_employees and crm_crews refuses a user_id whose
--    profile is not in the row's org. Client portal logins have no profile
--    row, so they are refused too. Applies to every caller, service role
--    included: every app path creates the profile first (invite, create-crew,
--    founder signup), so a mismatch is always a bug or an attack.
--
-- PROD pre-check (must return 0 rows; unlink any it finds before applying):
--   select 'employee' kind, e.id, e.org_id, e.user_id, p.org_id as profile_org
--     from crm_employees e left join profiles p on p.id = e.user_id
--    where e.user_id is not null and (p.id is null or p.org_id <> e.org_id)
--   union all
--   select 'crew', c.id, c.org_id, c.user_id, p.org_id
--     from crm_crews c left join profiles p on p.id = c.user_id
--    where c.user_id is not null and (p.id is null or p.org_id <> c.org_id);
--
-- Deploy order: safe BEFORE the code deploy (no app change depends on it).

create or replace function public.has_crm_access()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    (select role from public.profiles where id = auth.uid()) in ('admin', 'crew')
    or exists (
      select 1
      from public.crm_employees ce
      join public.crm_roles cr on cr.id = ce.crm_role_id
      where ce.user_id = auth.uid()
        -- the employee record must be in the login's own (home) org
        and ce.org_id = (select p.org_id from public.profiles p where p.id = auth.uid())
        and ce.deleted_at is null
        and ce.is_active
        and cr.deleted_at is null
        and cr.is_active
    );
$function$;

create or replace function public.has_settings_permission(p_key text)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_role text;
  v_home_org uuid;
  v_permissions jsonb;
begin
  select role, org_id into v_role, v_home_org from public.profiles where id = auth.uid();
  if v_role = 'admin' then
    return true;
  end if;

  select cr.permissions into v_permissions
  from public.crm_employees ce
  join public.crm_roles cr on cr.id = ce.crm_role_id
  where ce.user_id = auth.uid()
    -- the employee record must be in the login's own (home) org
    and ce.org_id = v_home_org
    and ce.deleted_at is null
    and ce.is_active
    and cr.deleted_at is null
    and cr.is_active;

  if v_permissions is null then
    return false;
  end if;

  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$function$;

create or replace function public.report_user_has_permission(p_user_id uuid, p_key text, p_org_id uuid default null::uuid)
 returns boolean
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_role text;
  v_org uuid;
  v_status text;
  v_permissions jsonb;
begin
  if p_user_id is null then return false; end if;
  select role, org_id, status into v_role, v_org, v_status from public.profiles where id = p_user_id;
  if not found then return false; end if;
  if p_org_id is not null and v_org is distinct from p_org_id then return false; end if;
  -- A deactivated login grants nothing, admin or not.
  if v_status = 'inactive' then return false; end if;
  if v_role = 'admin' then return true; end if;

  select cr.permissions into v_permissions
  from public.crm_employees ce
  join public.crm_roles cr on cr.id = ce.crm_role_id
  where ce.user_id = p_user_id
    and ce.org_id = v_org
    and ce.deleted_at is null
    and ce.is_active
    and cr.deleted_at is null
    and cr.is_active;
  if v_permissions is null then return false; end if;
  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$function$;

create or replace function public.my_crew_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select c.id
  from public.crm_crews c
  where c.user_id = auth.uid()
    and c.org_id = public.my_org_id()
    and c.deleted_at is null
  union
  select cm.crew_id
  from public.crm_crew_members cm
  join public.crm_employees e on e.id = cm.employee_id
  where e.user_id = auth.uid()
    and e.org_id = cm.org_id
    and e.is_active = true
    and e.deleted_at is null
    and cm.deleted_at is null
    and cm.org_id = public.my_org_id();
$function$;

-- ── Link guard ──────────────────────────────────────────────────────────────
create or replace function public.guard_login_link_same_org()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.user_id is not distinct from old.user_id
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = new.user_id and p.org_id = new.org_id
  ) then
    raise exception 'That login does not belong to this organization, so it cannot be linked here.'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

revoke all on function public.guard_login_link_same_org() from public, anon, authenticated;

drop trigger if exists trg_crm_employees_login_same_org on public.crm_employees;
create trigger trg_crm_employees_login_same_org
  before insert or update of user_id, org_id on public.crm_employees
  for each row execute function public.guard_login_link_same_org();

drop trigger if exists trg_crm_crews_login_same_org on public.crm_crews;
create trigger trg_crm_crews_login_same_org
  before insert or update of user_id, org_id on public.crm_crews
  for each row execute function public.guard_login_link_same_org();
