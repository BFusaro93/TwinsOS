-- Schedule a job directly to a person, like Service Autopilot: an employee
-- flagged "assignable to jobs" shows up in every crew dropdown (job form,
-- dispatch board, edit job) under their own name.
--
-- Implementation: each flagged employee owns a one-person "personal" crew,
-- kept in step by a trigger, so dispatch, the crew app, payroll and job costing
-- (all keyed to crm_crews) work unchanged. Unflagging or deactivating the
-- employee deactivates the crew — it is never deleted, so jobs and visits that
-- already point at it keep their history (same as any inactive crew).
--
-- If the employee has a login that is not already attached to another crew, the
-- personal crew is attached to it, so that login gets My Schedule.

alter table public.crm_employees
  add column if not exists assignable_to_jobs boolean not null default false;
grant select (assignable_to_jobs) on public.crm_employees to authenticated;

alter table public.crm_crews
  add column if not exists personal_employee_id uuid references public.crm_employees(id);
create unique index if not exists crm_crews_personal_employee_uniq
  on public.crm_crews (personal_employee_id)
  where personal_employee_id is not null and deleted_at is null;

create or replace function public.crm_sync_personal_crew()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(coalesce(new.first_name, '') || ' ' || coalesce(new.last_name, '')), '');
  v_crew uuid;
  v_want boolean := new.assignable_to_jobs and new.is_active and new.deleted_at is null;
begin
  select id into v_crew from public.crm_crews
   where personal_employee_id = new.id and deleted_at is null
   order by created_at limit 1;

  if not v_want then
    if v_crew is not null then
      update public.crm_crews set is_active = false, updated_at = now() where id = v_crew and is_active;
    end if;
    return new;
  end if;

  if v_crew is null then
    insert into public.crm_crews (org_id, name, is_active, personal_employee_id, foreman_id, user_id)
    values (
      new.org_id, coalesce(v_name, 'Employee'), true, new.id, new.id,
      case when new.user_id is not null and not exists (
             select 1 from public.crm_crews c
              where c.user_id = new.user_id and c.org_id = new.org_id and c.deleted_at is null)
           then new.user_id end
    )
    returning id into v_crew;
  else
    update public.crm_crews
       set is_active = true,
           name = coalesce(v_name, name),
           foreman_id = new.id,
           user_id = coalesce(user_id,
             case when new.user_id is not null and not exists (
                    select 1 from public.crm_crews c
                     where c.user_id = new.user_id and c.org_id = new.org_id
                       and c.deleted_at is null and c.id <> v_crew)
                  then new.user_id end),
           updated_at = now()
     where id = v_crew;
  end if;

  -- Someone who works a regular crew can't also be on a second crew on the same
  -- days (prevent_crew_member_day_overlap), so their personal crew keeps no
  -- standing roster row; they join it for a day through Team Assignment. A
  -- person on no crew (an owner or office employee) is its roster.
  if not exists (select 1 from public.crm_crew_members where crew_id = v_crew and employee_id = new.id) then
    begin
      insert into public.crm_crew_members (org_id, crew_id, employee_id, name, is_foreman)
      values (new.org_id, v_crew, new.id, coalesce(v_name, 'Employee'), true);
    exception when raise_exception then
      null;
    end;
  else
    update public.crm_crew_members set name = coalesce(v_name, name)
     where crew_id = v_crew and employee_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_sync_personal_crew() from public, anon, authenticated;

drop trigger if exists trg_crm_employees_personal_crew on public.crm_employees;
create trigger trg_crm_employees_personal_crew
  after insert or update of assignable_to_jobs, is_active, deleted_at, first_name, last_name, user_id
  on public.crm_employees
  for each row execute function public.crm_sync_personal_crew();
