-- Regression fix (review 2026-11-16): the visit payroll-lock trigger added in
-- 20270103000410 compared the visit's SCHEDULED date to the lock date on every
-- clock change. A crew starting a rolled-over visit (scheduled in a locked
-- period, never completed) is punching in TODAY, in an open period, but the
-- trigger raised "Payroll is locked" and the clock-in route returned a 500.
--
-- Now the lock is judged on the dates the work actually happened:
--   * a clock stamp being set / changed / cleared  -> the org-local date of the old and
--     new stamps (so editing or clearing a locked day's punch stays blocked, and a
--     fresh punch today is allowed whatever the visit was scheduled for);
--   * a break edit on a visit with stamps          -> the same stamp dates;
--   * a break edit on a visit with no stamps yet   -> the scheduled date, as before;
--   * any member punch on the visit in a locked period still blocks (unchanged).

create or replace function public.fn_crm_job_visits_payroll_lock()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_lock date;
  v_tz   text;
  v_stamps boolean;
  d date;
begin
  if new.break_minutes is not distinct from old.break_minutes
     and new.break_paid is not distinct from old.break_paid
     and new.clocked_in_at is not distinct from old.clocked_in_at
     and new.clocked_out_at is not distinct from old.clocked_out_at then
    return new;
  end if;

  if coalesce(current_setting('app.payroll_lock_bypass', true), '') = 'on'
     and not public._crm_direct_user_write() then
    return new;
  end if;

  v_lock := public.payroll_locked_through(new.org_id);
  if v_lock is null then
    return new;
  end if;

  v_tz := public.org_timezone(new.org_id);
  v_stamps := old.clocked_in_at is not null or new.clocked_in_at is not null
           or old.clocked_out_at is not null or new.clocked_out_at is not null;

  if v_stamps then
    foreach d in array array[
      (old.clocked_in_at  at time zone v_tz)::date,
      (new.clocked_in_at  at time zone v_tz)::date,
      (old.clocked_out_at at time zone v_tz)::date,
      (new.clocked_out_at at time zone v_tz)::date
    ] loop
      if d is not null and d <= v_lock then
        raise exception 'Payroll is locked through %; ask an admin to move the lock date.',
          to_char(v_lock, 'FMMon FMDD, YYYY')
          using errcode = 'P0001', hint = 'payroll_locked';
      end if;
    end loop;
  elsif least(old.scheduled_date, new.scheduled_date) <= v_lock then
    raise exception 'Payroll is locked through %; ask an admin to move the lock date.',
      to_char(v_lock, 'FMMon FMDD, YYYY')
      using errcode = 'P0001', hint = 'payroll_locked';
  end if;

  if exists (
       select 1
         from public.crm_crew_member_times t
        where t.visit_id = new.id
          and t.deleted_at is null
          and t.clocked_in_at is not null
          and public.payroll_punch_work_date(t.org_id, t.crew_member_id, t.clocked_in_at) <= v_lock
     ) then
    raise exception 'Payroll is locked through %; ask an admin to move the lock date.',
      to_char(v_lock, 'FMMon FMDD, YYYY')
      using errcode = 'P0001', hint = 'payroll_locked';
  end if;

  return new;
end;
$function$;

revoke all on function public.fn_crm_job_visits_payroll_lock() from public, anon, authenticated;
