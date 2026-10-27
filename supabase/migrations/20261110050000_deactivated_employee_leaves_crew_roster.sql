-- Deactivating (terminating) an employee left their crew roster rows
-- (crm_crew_members) in place. Every Start Day / Start Job then punched the
-- terminated person in, payroll carried them, and crew headcount (men_count,
-- dispatch capacity) still counted them.
--
-- Soft-delete the roster rows when the employee is deactivated or soft-deleted
-- (rows are never hard-deleted: payroll history hangs off them). Reactivation
-- does not restore them -- a rehire is re-added to a crew explicitly -- except
-- for the personal crew of an "assignable to jobs" employee, which
-- crm_sync_personal_crew() re-creates.

create or replace function public.crm_employee_leaves_crew_rosters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.is_active is distinct from true) or new.deleted_at is not null then
    update public.crm_crew_members
       set deleted_at = now()
     where employee_id = new.id
       and deleted_at is null;
  end if;
  return new;
end;
$$;
revoke all on function public.crm_employee_leaves_crew_rosters() from public, anon, authenticated;

drop trigger if exists trg_crm_employees_leave_crew_rosters on public.crm_employees;
create trigger trg_crm_employees_leave_crew_rosters
  after update of is_active, deleted_at on public.crm_employees
  for each row
  when (old.is_active is distinct from new.is_active or old.deleted_at is distinct from new.deleted_at)
  execute function public.crm_employee_leaves_crew_rosters();

-- Backfill: employees already deactivated.
update public.crm_crew_members m
   set deleted_at = now()
  from public.crm_employees e
 where m.employee_id = e.id
   and m.deleted_at is null
   and (e.is_active is distinct from true or e.deleted_at is not null);
