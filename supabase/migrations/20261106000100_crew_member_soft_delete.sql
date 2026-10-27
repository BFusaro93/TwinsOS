-- Removing someone from a crew used to hard-delete the crm_crew_members row,
-- and every history table cascaded off it (day shifts, absences, payroll
-- adjustments, stop punches) -- wiping payroll history. Soft-delete instead
-- and make the FKs RESTRICT so a hard delete can never take history with it.

alter table crm_crew_members add column if not exists deleted_at timestamptz;

-- A removed member must not block re-adding the same employee to the crew.
do $$
declare c text;
begin
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.crm_crew_members'::regclass
      and con.contype = 'u'
      and (select array_agg(a.attname::text order by a.attname)
             from pg_attribute a
            where a.attrelid = con.conrelid and a.attnum = any (con.conkey)) = array['crew_id','employee_id']
  loop
    execute format('alter table public.crm_crew_members drop constraint %I', c);
  end loop;
end $$;

drop index if exists crm_crew_members_crew_employee_key;
create unique index if not exists crm_crew_members_crew_employee_key
  on crm_crew_members (crew_id, employee_id)
  where employee_id is not null and deleted_at is null;

-- Overlap guard: ignore removed rows.
create or replace function public.prevent_crew_member_day_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if exists (
    select 1 from public.crm_crew_members m
    where m.employee_id = new.employee_id
      and m.id <> new.id
      and m.deleted_at is null
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
  before insert or update of employee_id, crew_id, days_of_week, deleted_at on public.crm_crew_members
  for each row execute function public.prevent_crew_member_day_overlap();

-- History tables: cascade -> restrict.
do $$
declare r record;
begin
  for r in
    select con.conrelid::regclass as tbl, con.conname,
           (select a.attname from pg_attribute a where a.attrelid = con.conrelid and a.attnum = con.conkey[1]) as col
    from pg_constraint con
    where con.contype = 'f'
      and con.confrelid = 'public.crm_crew_members'::regclass
      and con.confdeltype = 'c'
      and con.conrelid::regclass::text in (
        'crm_crew_day_shifts', 'crm_crew_day_absences', 'crm_payroll_adjustments', 'crm_crew_member_times',
        'public.crm_crew_day_shifts', 'public.crm_crew_day_absences', 'public.crm_payroll_adjustments', 'public.crm_crew_member_times')
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I foreign key (%I) references public.crm_crew_members(id) on delete restrict',
                   r.tbl, r.conname, r.col);
  end loop;
end $$;
