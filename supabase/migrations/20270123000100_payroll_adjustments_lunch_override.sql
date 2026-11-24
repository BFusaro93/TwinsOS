-- Payroll: a separate unpaid-lunch deduction for the day.
--
-- "Min off" (break_override / the recorded breaks) is the day's total time off the
-- clock and doubles as an alert: gaps and pauses the crew recorded show up there so
-- the office can spot a person who wasn't on a job. A fixed daily lunch that varies
-- from day to day (crews don't clock out for it) was being typed into that box,
-- which hid the alert and REPLACED the recorded figure.
--
-- lunch_override is a second, independent deduction: paid time = shift - min off -
-- lunch. NULL = no lunch deduction. It never feeds the long-break warning.
--
-- Writes go through /api/crm/reports/payroll (payroll_report permission). The payroll
-- lock guard and the audit trigger already cover every column of
-- crm_payroll_adjustments, so nothing else changes.

alter table public.crm_payroll_adjustments
  add column if not exists lunch_override integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_payroll_adjustments_lunch_override_check'
       and conrelid = 'public.crm_payroll_adjustments'::regclass
  ) then
    alter table public.crm_payroll_adjustments
      add constraint crm_payroll_adjustments_lunch_override_check
      check (lunch_override is null or (lunch_override >= 0 and lunch_override <= 480));
  end if;
end $$;

comment on column public.crm_payroll_adjustments.lunch_override is
  'Unpaid lunch minutes deducted for the day, on top of the recorded/overridden time off the clock (break_override). NULL = none.';

notify pgrst, 'reload schema';
