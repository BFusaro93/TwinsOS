-- Nothing prevented the same employee being rostered on two different
-- crews with overlapping days_of_week — crm_crew_members only has
-- unique(crew_id, employee_id), which stops a duplicate row on the SAME
-- crew but does nothing for two different crews. A person permanently
-- assigned to both ends up double-booked: they show on both crews'
-- rosters for the overlapping day, can get clocked in on both crews'
-- visits, and both visits' actual_labor_cost_cents roll up independently
-- — one person's hours counted twice against total labor cost/job costing.
create or replace function public.prevent_crew_member_day_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.crm_crew_members m
    where m.employee_id = new.employee_id
      and m.id <> new.id
      and m.crew_id <> new.crew_id
      and m.days_of_week && new.days_of_week
  ) then
    raise exception 'This employee is already assigned to another crew on one or more of these days';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_crew_member_day_overlap on public.crm_crew_members;
create trigger trg_prevent_crew_member_day_overlap
  before insert or update of employee_id, crew_id, days_of_week on public.crm_crew_members
  for each row execute function public.prevent_crew_member_day_overlap();
