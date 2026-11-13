-- Payroll lock: date punches the way payroll does, and lock the visit fields
-- payroll reads.
--
-- 1. payroll_punch_work_date(org, member, instant): the work date payroll
--    (src/lib/payroll/compute.ts punchDate) files a punch under — the work_date
--    of the member's day shift that covers the punch instant (a storm shift
--    started the evening before, an 1am punch still belongs to it), else the
--    org-local date of the instant. Same rules as compute.ts:
--      * only the shift of the previous local day can claim the punch;
--      * an ENDED shift claims punches from started_at through ended_at;
--      * an OPEN shift claims them until 6 hours past its work date's midnight,
--        or the member's next shift start if that is earlier.
--    fn_payroll_lock_guard used the punch's own local date, so with payroll
--    locked through Monday, a 1am Tuesday punch on Monday's storm shift — paid
--    on Monday — could still be edited. The guard now uses this date.
--
-- 2. crm_job_visits: break_minutes (stop pauses), break_paid (paid/unpaid
--    override), clocked_in_at and clocked_out_at (the window a member's share
--    of the pause is capped to) all feed payroll (compute.ts), but only the
--    punch / shift / adjustment tables were locked. A BEFORE UPDATE trigger now
--    refuses a change to any of them, with the same sentence and the same
--    maintenance bypass (app.payroll_lock_bypass, never for an end-user
--    session) as fn_payroll_lock_guard, when the visit is inside the lock:
--      * its scheduled_date (old or new) is on or before the lock date, or
--      * it carries a live punch whose payroll work date is on or before it.
--    Named zz_… so it runs AFTER every other BEFORE UPDATE trigger on the table
--    and so judges the row those triggers produced.
--
-- DEPLOY: either order. Old live code gets the refusal as a 500 from
-- break-paid / resume / clock-out on a locked visit; new code maps it to 409.

-- ── 1. the punch's payroll work date ───────────────────────────────────────
create or replace function public.payroll_punch_work_date(p_org_id uuid, p_member_id uuid, p_at timestamptz)
returns date
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_local date;
  v_prev record;
  v_next_start timestamptz;
  v_end timestamptz;
begin
  if p_at is null then
    return null;
  end if;
  v_tz := public.org_timezone(p_org_id);
  v_local := (p_at at time zone v_tz)::date;
  -- An end user only resolves punches in their own org (shift times are not theirs to probe).
  if auth.uid() is not null
     and current_user in ('authenticated', 'anon')
     and p_org_id is distinct from public.my_org_id() then
    return v_local;
  end if;

  select s.work_date, s.started_at, s.ended_at
    into v_prev
    from public.crm_crew_day_shifts s
   where s.org_id = p_org_id
     and s.crew_member_id = p_member_id
     and s.work_date = v_local - 1
     and s.deleted_at is null
   order by s.started_at desc
   limit 1;
  if not found then
    return v_local;
  end if;

  if v_prev.ended_at is not null then
    v_end := v_prev.ended_at;
  else
    v_end := ((v_prev.work_date + 1)::timestamp at time zone v_tz) + interval '6 hours';
    select s.started_at
      into v_next_start
      from public.crm_crew_day_shifts s
     where s.org_id = p_org_id
       and s.crew_member_id = p_member_id
       and s.work_date = v_local
       and s.deleted_at is null
     order by s.started_at
     limit 1;
    if v_next_start is not null then
      v_end := least(v_end, v_next_start);
    end if;
  end if;

  return case when p_at >= v_prev.started_at and p_at <= v_end then v_prev.work_date else v_local end;
end;
$function$;

revoke all on function public.payroll_punch_work_date(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.payroll_punch_work_date(uuid, uuid, timestamptz) to authenticated, service_role;

-- ── 2. fn_payroll_lock_guard: live body, punch branch uses the payroll date ──
create or replace function public.fn_payroll_lock_guard()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_lock date;
  v_new date;
  r jsonb;
begin
  if coalesce(current_setting('app.payroll_lock_bypass', true), '') = 'on'
     and not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  v_lock := public.payroll_locked_through(v_org);
  if v_lock is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
     and (to_jsonb(new) - array['updated_at', 'updated_by']) = (to_jsonb(old) - array['updated_at', 'updated_by']) then
    return new;
  end if;

  foreach r in array (
    case tg_op
      when 'INSERT' then array[to_jsonb(new)]
      when 'DELETE' then array[to_jsonb(old)]
      else array[to_jsonb(old), to_jsonb(new)]
    end
  ) loop
    if tg_table_name = 'crm_crew_member_times' then
      v_new := case
        -- The date payroll files the punch under: the covering day shift's
        -- work_date (storm work past midnight), else the punch's local date.
        when r ->> 'clocked_in_at' is not null
          then public.payroll_punch_work_date(v_org, (r ->> 'crew_member_id')::uuid, (r ->> 'clocked_in_at')::timestamptz)
        -- (RLS may hide the visit from the writer: then nothing to compare.)
        else (select v.scheduled_date from public.crm_job_visits v where v.id = (r ->> 'visit_id')::uuid)
      end;
    else
      v_new := (r ->> 'work_date')::date;
    end if;
    if v_new is not null and v_new <= v_lock then
      raise exception 'Payroll is locked through %; ask an admin to move the lock date.',
        to_char(v_lock, 'FMMon FMDD, YYYY')
        using errcode = 'P0001', hint = 'payroll_locked';
    end if;
  end loop;

  return coalesce(new, old);
end;
$function$;

revoke all on function public.fn_payroll_lock_guard() from public, anon, authenticated;

-- ── 3. the visit fields payroll reads ──────────────────────────────────────
-- SECURITY INVOKER for the same reason as fn_payroll_lock_guard:
-- _crm_direct_user_write() looks at current_user.
create or replace function public.fn_crm_job_visits_payroll_lock()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_lock date;
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

  if least(old.scheduled_date, new.scheduled_date) <= v_lock
     or exists (
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

drop trigger if exists zz_crm_job_visits_payroll_lock on public.crm_job_visits;
create trigger zz_crm_job_visits_payroll_lock
  before update on public.crm_job_visits
  for each row
  when (
    old.break_minutes is distinct from new.break_minutes
    or old.break_paid is distinct from new.break_paid
    or old.clocked_in_at is distinct from new.clocked_in_at
    or old.clocked_out_at is distinct from new.clocked_out_at
  )
  execute function public.fn_crm_job_visits_payroll_lock();
