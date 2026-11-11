-- Payroll lock date.
--
-- Once a pay period is exported and paid, nothing should quietly change the
-- hours behind it: an office edit to an old punch, a crew punch-editor fix, a
-- late offline replay, or a forgotten shift being closed days later all moved
-- paid time after the fact.
--
-- organizations.payroll_locked_through (date, nullable): every insert, update
-- or delete of payroll time whose WORK DATE is on or before that date is
-- refused with "Payroll is locked through <date>; ask an admin to move the lock
-- date". Covered tables (the three inputs payroll reads):
--   * crm_crew_day_shifts      — work date = work_date
--   * crm_payroll_adjustments  — work date = work_date
--   * crm_crew_member_times    — work date = the org-local date of clocked_in_at
--                                (the visit's scheduled_date when there is no
--                                clock-in). A punch after midnight on a storm
--                                shift that started the evening before counts
--                                as the later date here.
-- Both the old and the new row are checked, so a row can't be moved into or
-- out of the locked period either. An UPDATE that changes nothing but
-- updated_at / updated_by is let through (no payroll value moved).
--
-- Who the lock applies to. It applies to EVERY writer, not only end-user
-- sessions (_crm_direct_user_write()): crew-app writes go through the service
-- role after the route's own checks, and Start Day's member-in RPC is SECURITY
-- DEFINER, so an end-user-only lock would let exactly the late, queued writes
-- it exists to stop through. Server paths that close a forgotten shift or punch
-- (End Day, Stop Job, skip, member out) therefore still work for anything AFTER
-- the lock date and are refused on or before it — the row stays open and shows
-- on the Payroll tab, where an admin can move the lock date back to fix it.
-- Maintenance only: a non-end-user session may set
-- app.payroll_lock_bypass = 'on' for one transaction (never honoured for an
-- end-user session).
--
-- Moving the date: only an admin (profiles.role = 'admin') may change it from
-- an end-user session, and it must be before the org's today — today's and
-- future time is still being recorded. Every change is in the organization
-- audit history (trg_audit_organizations).

alter table public.organizations
  add column if not exists payroll_locked_through date;

comment on column public.organizations.payroll_locked_through is
  'Payroll time (shifts, punches, payroll adjustments) with a work date on or before this date can no longer be changed. Admins move it in Payroll.';

-- Both trigger functions below are SECURITY INVOKER on purpose:
-- _crm_direct_user_write() looks at current_user, which a SECURITY DEFINER
-- function replaces with its owner, so inside one every caller would look like
-- a server path. The org's lock date is read through a small definer helper.
create or replace function public.payroll_locked_through(p_org_id uuid)
returns date
language sql
stable
security definer
set search_path to 'public'
as $function$
  -- An end user only ever learns their own org's date (callable via RPC).
  select o.payroll_locked_through from public.organizations o
  where o.id = p_org_id
    and (auth.uid() is null or p_org_id = public.my_org_id() or current_user not in ('authenticated', 'anon'));
$function$;

revoke all on function public.payroll_locked_through(uuid) from public, anon;
grant execute on function public.payroll_locked_through(uuid) to authenticated, service_role;

-- ── Who may move the lock date ──────────────────────────────────────────────
create or replace function public.fn_organizations_guard_payroll_lock()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
begin
  if new.payroll_locked_through is not distinct from old.payroll_locked_through then
    return new;
  end if;
  if public._crm_direct_user_write() and coalesce(public.my_role(), '') <> 'admin' then
    raise exception 'Only an admin can change the payroll lock date.' using errcode = '42501';
  end if;
  if new.payroll_locked_through is not null
     and new.payroll_locked_through >= public.org_today(new.id) then
    raise exception 'The payroll lock date must be before today.' using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_organizations_guard_payroll_lock() from public, anon, authenticated;

drop trigger if exists trg_organizations_guard_payroll_lock on public.organizations;
create trigger trg_organizations_guard_payroll_lock
  before update of payroll_locked_through on public.organizations
  for each row execute function public.fn_organizations_guard_payroll_lock();

-- ── The lock itself ─────────────────────────────────────────────────────────
create or replace function public.fn_payroll_lock_guard()
returns trigger
language plpgsql
security invoker
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
        when r ->> 'clocked_in_at' is not null
          then ((r ->> 'clocked_in_at')::timestamptz at time zone public.org_timezone(v_org))::date
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

drop trigger if exists trg_crm_crew_day_shifts_payroll_lock on public.crm_crew_day_shifts;
create trigger trg_crm_crew_day_shifts_payroll_lock
  before insert or update or delete on public.crm_crew_day_shifts
  for each row execute function public.fn_payroll_lock_guard();

drop trigger if exists trg_crm_crew_member_times_payroll_lock on public.crm_crew_member_times;
create trigger trg_crm_crew_member_times_payroll_lock
  before insert or update or delete on public.crm_crew_member_times
  for each row execute function public.fn_payroll_lock_guard();

drop trigger if exists trg_crm_payroll_adjustments_payroll_lock on public.crm_payroll_adjustments;
create trigger trg_crm_payroll_adjustments_payroll_lock
  before insert or update or delete on public.crm_payroll_adjustments
  for each row execute function public.fn_payroll_lock_guard();
