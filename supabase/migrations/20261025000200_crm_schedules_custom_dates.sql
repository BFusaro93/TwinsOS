-- Custom schedules: a schedule can be an explicit list of service dates picked from a calendar,
-- instead of a weekday + frequency rule. frequency = 'custom' reads custom_dates; day_of_week is
-- kept (NOT NULL) but ignored.
alter table public.crm_schedules
  add column if not exists custom_dates date[] not null default '{}';

-- Widen any CHECK on frequency to allow 'custom' (constraint name isn't stable across envs).
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.crm_schedules'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%frequency%'
  loop
    execute format('alter table public.crm_schedules drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.crm_schedules
  add constraint crm_schedules_frequency_check
  check (frequency in ('weekly','bi_weekly','every_3_weeks','every_4_weeks','monthly','custom'));
