-- Payroll: PTO hours are paid but never count toward overtime.
--
-- A day's payroll adjustment had one "Extra hours" figure used for both shop
-- time and PTO, and the overtime split (src/lib/payroll/overtime.ts) counted all
-- of it. Owner rule: any WORKED hours count toward overtime, PTO doesn't.
--
-- pto_hours sits next to extra_hours (which stays "extra worked time"): the
-- Payroll tab adds it to the day's paid total and to Regular hours, but leaves
-- it out of the weekly/daily overtime threshold. Existing extra_hours rows keep
-- counting as worked time.
--
-- Writes go through /api/crm/reports/payroll (payroll_report permission). The
-- payroll lock guard and the audit trigger already cover every column of
-- crm_payroll_adjustments, so nothing else changes.

alter table public.crm_payroll_adjustments
  add column if not exists pto_hours numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'crm_payroll_adjustments_pto_hours_check'
       and conrelid = 'public.crm_payroll_adjustments'::regclass
  ) then
    alter table public.crm_payroll_adjustments
      add constraint crm_payroll_adjustments_pto_hours_check check (pto_hours >= 0);
  end if;
end $$;

comment on column public.crm_payroll_adjustments.pto_hours is
  'Paid time off for the day (hours). Paid and counted in Regular hours, never toward overtime. extra_hours is extra WORKED time and does count toward overtime.';

notify pgrst, 'reload schema';
