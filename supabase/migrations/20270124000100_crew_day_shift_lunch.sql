-- Crew app: a day-level Lunch button (Start Lunch / End Lunch) for lunch taken BETWEEN jobs.
--
-- Job-level "Take a Break" only exists while a job is open, so a lunch eaten between stops was
-- never recorded and the office had to enter it by hand. Start Lunch / End Lunch on the crew's
-- day card record it on each working member's shift:
--   lunch_started_at  set while a lunch is running (NULL otherwise)
--   lunch_minutes     total lunch minutes recorded for the shift (several lunches add up)
--
-- Payroll treats lunch_minutes as the day's lunch deduction (separate from min off, which stays the
-- off-the-job alert); the office can still correct it with crm_payroll_adjustments.lunch_override.
--
-- Written only by /api/crm/crew/day (service client, scoped to the crew's roster). The payroll lock
-- guard and the audit trigger already cover every column of crm_crew_day_shifts.

alter table public.crm_crew_day_shifts
  add column if not exists lunch_started_at timestamptz,
  add column if not exists lunch_minutes integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_crew_day_shifts_lunch_minutes_check'
       and conrelid = 'public.crm_crew_day_shifts'::regclass
  ) then
    alter table public.crm_crew_day_shifts
      add constraint crm_crew_day_shifts_lunch_minutes_check
      check (lunch_minutes >= 0 and lunch_minutes <= 1440);
  end if;
end $$;

comment on column public.crm_crew_day_shifts.lunch_started_at is
  'Set while a crew lunch is running (Start Lunch tapped, End Lunch not yet). NULL otherwise.';
comment on column public.crm_crew_day_shifts.lunch_minutes is
  'Total lunch minutes recorded for this shift via Start/End Lunch. Payroll deducts it (separately from break_minutes / min off).';

notify pgrst, 'reload schema';
