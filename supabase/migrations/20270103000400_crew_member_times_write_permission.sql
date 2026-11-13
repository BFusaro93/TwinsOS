-- Crew punches (crm_crew_member_times): only dispatch or payroll may write them,
-- and a member's punches may not overlap.
--
-- 1. Write permission. The permissive policy was a single org-only ALL
--    ("org members manage crew member times"), so ANY office login with CRM
--    access — a salesperson, an account manager, a viewer-ish role — could
--    insert, rewrite or delete payroll punches through PostgREST (and through
--    /api/crm/crew/visits/[id]/member-times, which had no permission check).
--    Now:
--      SELECT  — unchanged: any org member (the dispatch board, the crew app's
--                own read of its stop, payroll, reports all read punches).
--      INSERT / UPDATE / DELETE — the org AND one of:
--                * sched_dispatch_board (the board's Edit Job Times dialog),
--                * payroll_report (the Payroll tab's owners),
--                * the member is on a crew this login runs that day
--                  (crew_day_member_is_mine — the same rule crm_crew_day_shifts
--                  uses, for a non-crew login linked to a crew via
--                  crm_crews.user_id).
--      Admins pass has_settings_permission. The existing RESTRICTIVE policies
--      (require_crm_access, read-only org, crew_role_no_direct_write_*,
--      crew_role_own_visit_*) are untouched. Crew logins never write punches
--      directly — every crew flow writes with the service role after the
--      route's own checks, which RLS does not apply to.
--
-- 2. No overlapping punches for the same crew member, for END-USER writes
--    (_crm_direct_user_write(): the office's Edit Job Times through PostgREST).
--    Server paths (crew routes on the service role, Start/Stop Job, member
--    moves, auto-stop) are exempt: Start Job may open the next stop's punch an
--    instant before the previous stop's open punch is closed by the same
--    request, and refusing that batch would silently drop a whole crew's time.
--    The member-times route checks overlaps for every caller itself.
--    Same visit = same row (one punch per visit + member), so an upsert onto
--    the existing row never collides with itself. Zero-length punches never
--    overlap anything.
--
-- DEPLOY: PROD can take this BEFORE the code deploy. Old live code keeps
-- working for everyone who holds the keys; an office login without them gets a
-- row-level-security error from Edit Job Times (old code shows it as a 500
-- toast, new code answers 403 first) — that refusal is the fix.

-- ── 1. policies ─────────────────────────────────────────────────────────────
drop policy if exists "org members manage crew member times" on public.crm_crew_member_times;
drop policy if exists "org members read crew member times" on public.crm_crew_member_times;
drop policy if exists "dispatch or payroll insert crew member times" on public.crm_crew_member_times;
drop policy if exists "dispatch or payroll update crew member times" on public.crm_crew_member_times;
drop policy if exists "dispatch or payroll delete crew member times" on public.crm_crew_member_times;

create policy "org members read crew member times" on public.crm_crew_member_times
  for select
  using (org_id = (select public.my_org_id()));

create policy "dispatch or payroll insert crew member times" on public.crm_crew_member_times
  for insert
  with check (
    org_id = (select public.my_org_id())
    and (
      (select public.has_settings_permission('sched_dispatch_board'))
      or (select public.has_settings_permission('payroll_report'))
      or public.crew_day_member_is_mine(crew_member_id, (coalesce(clocked_in_at, now()) at time zone public.org_timezone(org_id))::date)
    )
  );

create policy "dispatch or payroll update crew member times" on public.crm_crew_member_times
  for update
  using (
    org_id = (select public.my_org_id())
    and (
      (select public.has_settings_permission('sched_dispatch_board'))
      or (select public.has_settings_permission('payroll_report'))
      or public.crew_day_member_is_mine(crew_member_id, (coalesce(clocked_in_at, now()) at time zone public.org_timezone(org_id))::date)
    )
  )
  with check (
    org_id = (select public.my_org_id())
    and (
      (select public.has_settings_permission('sched_dispatch_board'))
      or (select public.has_settings_permission('payroll_report'))
      or public.crew_day_member_is_mine(crew_member_id, (coalesce(clocked_in_at, now()) at time zone public.org_timezone(org_id))::date)
    )
  );

create policy "dispatch or payroll delete crew member times" on public.crm_crew_member_times
  for delete
  using (
    org_id = (select public.my_org_id())
    and (
      (select public.has_settings_permission('sched_dispatch_board'))
      or (select public.has_settings_permission('payroll_report'))
      or public.crew_day_member_is_mine(crew_member_id, (coalesce(clocked_in_at, now()) at time zone public.org_timezone(org_id))::date)
    )
  );

-- ── 2. overlapping punches ──────────────────────────────────────────────────
create or replace function public.fn_crm_crew_member_times_no_overlap()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_in timestamptz;
  v_out timestamptz;
  v_tz text;
begin
  if not public._crm_direct_user_write() then
    return new;
  end if;
  if new.deleted_at is not null or new.clocked_in_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.clocked_in_at is not distinct from old.clocked_in_at
     and new.clocked_out_at is not distinct from old.clocked_out_at
     and new.crew_member_id is not distinct from old.crew_member_id
     and old.deleted_at is null then
    return new;
  end if;

  select t.clocked_in_at, t.clocked_out_at
    into v_in, v_out
    from public.crm_crew_member_times t
   where t.crew_member_id = new.crew_member_id
     and t.visit_id <> new.visit_id
     and t.id <> new.id
     and t.deleted_at is null
     and t.clocked_in_at is not null
     and tstzrange(t.clocked_in_at, greatest(t.clocked_in_at, coalesce(t.clocked_out_at, 'infinity'::timestamptz)), '[)')
         && tstzrange(new.clocked_in_at, greatest(new.clocked_in_at, coalesce(new.clocked_out_at, 'infinity'::timestamptz)), '[)')
   order by t.clocked_in_at
   limit 1;

  if found then
    v_tz := public.org_timezone(new.org_id);
    raise exception 'This punch overlaps another punch for the same crew member (% – %). Correct or remove that punch first.',
      to_char(v_in at time zone v_tz, 'FMMon FMDD FMHH12:MI AM'),
      coalesce(to_char(v_out at time zone v_tz, 'FMHH12:MI AM'), 'still clocked in')
      using errcode = '23P01', hint = 'punch_overlap';
  end if;
  return new;
end;
$function$;

revoke all on function public.fn_crm_crew_member_times_no_overlap() from public, anon, authenticated;

drop trigger if exists trg_crm_crew_member_times_no_overlap on public.crm_crew_member_times;
create trigger trg_crm_crew_member_times_no_overlap
  before insert or update on public.crm_crew_member_times
  for each row execute function public.fn_crm_crew_member_times_no_overlap();
