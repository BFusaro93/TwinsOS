-- Crew day clock + payroll: tighten RLS.
--
-- The original policies (20261030000100) let ANY org member read and write
-- crm_crew_day_shifts / crm_crew_day_absences (viewers, deactivated employees,
-- every crew login for every crew) and resolved the org through a profiles
-- subquery, which breaks staff impersonation (my_org_id() honors it).
--
-- Who legitimately touches these tables:
--   * crew logins (the crew app, via the caller's own RLS client): Start/End
--     Day, member in/out, attendance. Only for members on THEIR crew that day.
--   * office staff with the Dispatch Board permission (sched_dispatch_board).
--   * the Payroll report, which reads shifts for the whole org: payroll_report.
-- crm_payroll_adjustments moves from "profiles.role in (admin, manager)" to the
-- new payroll_report crm_roles permission (admins always pass).

-- ── 1. is this member on my (crew login's) crew that day? ────────────────────
-- Effective crew = the same-day reassignment (crm_crew_daily_members) when one
-- exists, else the member's permanent crew. Matches resolveWorkingMemberIds.
create or replace function public.crew_day_member_is_mine(p_member uuid, p_work_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_crew_members m
    join public.crm_crews c
      on c.id = coalesce(
        (select d.crew_id from public.crm_crew_daily_members d
          where d.member_id = m.id and d.work_date = p_work_date and d.org_id = m.org_id limit 1),
        m.crew_id)
    where m.id = p_member
      and m.org_id = public.my_org_id()
      and c.org_id = m.org_id
      and c.user_id = auth.uid()
      and c.deleted_at is null
  );
$$;
revoke all on function public.crew_day_member_is_mine(uuid, date) from public, anon;
grant execute on function public.crew_day_member_is_mine(uuid, date) to authenticated;

-- ── 2. shifts + absences ─────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['crm_crew_day_shifts', 'crm_crew_day_absences'] loop
    execute format('drop policy if exists "org members manage crew day shifts" on public.%I', t);
    execute format('drop policy if exists "org members manage crew day absences" on public.%I', t);
    execute format('drop policy if exists crew_day_select on public.%I', t);
    execute format('drop policy if exists crew_day_insert on public.%I', t);
    execute format('drop policy if exists crew_day_update on public.%I', t);
    execute format('drop policy if exists "require_crm_access" on public.%I', t);

    -- Read: dispatch / payroll staff, or the crew's own login for its members.
    execute format($f$create policy crew_day_select on public.%I for select using (
      org_id = public.my_org_id() and public.has_crm_access() and (
        public.has_settings_permission('sched_dispatch_board')
        or public.has_settings_permission('payroll_report')
        or public.crew_day_member_is_mine(crew_member_id, work_date)
      ))$f$, t);
    -- Write (no hard deletes anywhere: rows are soft-deleted via UPDATE).
    execute format($f$create policy crew_day_insert on public.%I for insert with check (
      org_id = public.my_org_id() and public.has_crm_access() and (
        public.has_settings_permission('sched_dispatch_board')
        or public.crew_day_member_is_mine(crew_member_id, work_date)
      ))$f$, t);
    execute format($f$create policy crew_day_update on public.%I for update using (
      org_id = public.my_org_id() and public.has_crm_access() and (
        public.has_settings_permission('sched_dispatch_board')
        or public.crew_day_member_is_mine(crew_member_id, work_date)
      )) with check (
      org_id = public.my_org_id() and public.has_crm_access() and (
        public.has_settings_permission('sched_dispatch_board')
        or public.crew_day_member_is_mine(crew_member_id, work_date)
      ))$f$, t);
    execute format('create policy "require_crm_access" on public.%I as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access())', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ── 3. payroll_report permission key + adjustments policy ────────────────────
-- Seeded default roles only (additive); custom roles get it from Settings.
update public.crm_roles
set permissions = coalesce(permissions, '{}'::jsonb) || jsonb_build_object('payroll_report', true)
where deleted_at is null and name in ('Owner', 'Operations Manager', 'Office Admin');

drop policy if exists "office manages payroll adjustments" on public.crm_payroll_adjustments;
drop policy if exists payroll_adjustments_all on public.crm_payroll_adjustments;
create policy payroll_adjustments_all on public.crm_payroll_adjustments for all
  using (org_id = public.my_org_id() and public.has_crm_access() and public.has_settings_permission('payroll_report'))
  with check (org_id = public.my_org_id() and public.has_crm_access() and public.has_settings_permission('payroll_report'));
drop policy if exists "require_crm_access" on public.crm_payroll_adjustments;
create policy "require_crm_access" on public.crm_payroll_adjustments
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());
revoke all on public.crm_payroll_adjustments from anon;

-- ── 4. member_in as one transaction ──────────────────────────────────────────
-- Back on the roster (absence cleared) and shift open/reopened, atomically, so
-- a failure can't leave the member neither absent nor clocked in. SECURITY
-- INVOKER: the policies above still decide who may do it.
create or replace function public.crew_day_member_in(p_member uuid, p_work_date date, p_at timestamptz)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.my_org_id();
  v_shift record;
  v_away integer;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_crew_members where id = p_member and org_id = v_org) then
    raise exception 'crew member not found' using errcode = '42501';
  end if;

  select id, ended_at, break_minutes into v_shift
  from public.crm_crew_day_shifts
  where crew_member_id = p_member and work_date = p_work_date and deleted_at is null and org_id = v_org
  for update;

  if found then
    -- Left, then came back: reopen and take the time away off the clock.
    v_away := case when v_shift.ended_at is null then 0
                   else greatest(0, round(extract(epoch from (p_at - v_shift.ended_at)) / 60)::integer) end;
    update public.crm_crew_day_shifts
      set ended_at = null, break_minutes = coalesce(v_shift.break_minutes, 0) + v_away
      where id = v_shift.id;
  else
    insert into public.crm_crew_day_shifts (org_id, crew_member_id, work_date, started_at, source, created_by)
    values (v_org, p_member, p_work_date, p_at, 'crew', auth.uid());
  end if;

  update public.crm_crew_day_absences set deleted_at = p_at
    where crew_member_id = p_member and work_date = p_work_date and deleted_at is null and org_id = v_org;
end;
$$;
revoke all on function public.crew_day_member_in(uuid, date, timestamptz) from public, anon;
grant execute on function public.crew_day_member_in(uuid, date, timestamptz) to authenticated;

-- ── 5. canceled-subscription read-only pattern ───────────────────────────────
-- Same restrictive ins/upd/del policies as 20260926190000 and its followers.
do $$
declare t text;
begin
  foreach t in array array[
    'crm_crew_day_shifts', 'crm_crew_day_absences', 'crm_payroll_adjustments',
    'crm_warranty_types', 'crm_warranties',
    'crm_commission_plans', 'crm_commission_plan_rules', 'crm_commission_assignments',
    'crm_commission_statements', 'crm_commission_statement_lines'
  ] loop
    execute format('drop policy if exists "read_only_when_canceled_ins" on public.%I', t);
    execute format('create policy "read_only_when_canceled_ins" on public.%I as restrictive for insert with check ((select public.my_org_is_read_only()) is not true)', t);
    execute format('drop policy if exists "read_only_when_canceled_upd" on public.%I', t);
    execute format('create policy "read_only_when_canceled_upd" on public.%I as restrictive for update using ((select public.my_org_is_read_only()) is not true)', t);
    execute format('drop policy if exists "read_only_when_canceled_del" on public.%I', t);
    execute format('create policy "read_only_when_canceled_del" on public.%I as restrictive for delete using ((select public.my_org_is_read_only()) is not true)', t);
  end loop;
end $$;
