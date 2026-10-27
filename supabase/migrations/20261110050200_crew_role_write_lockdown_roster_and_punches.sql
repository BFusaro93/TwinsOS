-- Crew logins (profiles.role = 'crew', shared field tablets) could WRITE the
-- crew roster, the crews themselves and every crew's payroll punches straight
-- through PostgREST.
--
-- 20260910160000_crew_write_lockdown closed this for crm_job_visits / crm_jobs /
-- crm_job_services but these tables kept a single permissive policy
-- (org_id = my_org_id()), and has_crm_access() whitelists role 'crew':
--   * crm_crews: a crew login could re-point crm_crews.user_id (the login -> crew
--     link every crew route authorizes against) at itself, i.e. take over any
--     other crew's schedule, or rename / deactivate crews;
--   * crm_crew_members: rewrite labor_burden_cents_per_hour (labor cost on every
--     job), move people between crews, soft-delete roster rows;
--   * crm_crew_member_times: rewrite or delete ANY crew's punches (the payroll
--     source). The API route checks ownership; a hand-made request did not;
--   * crm_crew_daily_members: move people between crews for a day (the crew app's
--     "add someone today" goes through a service-role route, not this table);
--   * crm_crew_drive_segments: write another crew's drive time.
--
-- Fix: RESTRICTIVE policies (AND-ed with the existing permissive ones) that only
-- constrain role 'crew', leaving every office role and every service-role route
-- untouched. READS are deliberately left as they are (the crew-visible
-- dashboards read rpt_* views over these tables -- same call as the earlier
-- lockdown). Everything the crew app writes keeps working:
--   * punches: only on visits the caller can see (crew SELECT on crm_job_visits is
--     already scoped to the crew's own visits, effective crew included);
--   * drive segments: only for the caller's own crew (my_crew_ids()).
-- Idempotent.

do $$
declare
  t text;
begin
  -- Roster / crew definition tables: read-only for crew logins.
  foreach t in array array['crm_crews', 'crm_crew_members', 'crm_crew_daily_members'] loop
    execute format('drop policy if exists crew_role_no_insert on public.%I', t);
    execute format($f$create policy crew_role_no_insert on public.%I as restrictive for insert
      with check (coalesce(public.my_role(), '') <> 'crew')$f$, t);
    execute format('drop policy if exists crew_role_no_update on public.%I', t);
    execute format($f$create policy crew_role_no_update on public.%I as restrictive for update
      using (coalesce(public.my_role(), '') <> 'crew')
      with check (coalesce(public.my_role(), '') <> 'crew')$f$, t);
    execute format('drop policy if exists crew_role_no_delete on public.%I', t);
    execute format($f$create policy crew_role_no_delete on public.%I as restrictive for delete
      using (coalesce(public.my_role(), '') <> 'crew')$f$, t);
  end loop;
end $$;

-- Punches: a crew login may only write punches on visits it can see (its own).
drop policy if exists crew_role_own_visit_insert on public.crm_crew_member_times;
create policy crew_role_own_visit_insert on public.crm_crew_member_times as restrictive for insert
  with check (
    coalesce(public.my_role(), '') <> 'crew'
    or exists (select 1 from public.crm_job_visits v where v.id = crm_crew_member_times.visit_id)
  );
drop policy if exists crew_role_own_visit_update on public.crm_crew_member_times;
create policy crew_role_own_visit_update on public.crm_crew_member_times as restrictive for update
  using (
    coalesce(public.my_role(), '') <> 'crew'
    or exists (select 1 from public.crm_job_visits v where v.id = crm_crew_member_times.visit_id)
  )
  with check (
    coalesce(public.my_role(), '') <> 'crew'
    or exists (select 1 from public.crm_job_visits v where v.id = crm_crew_member_times.visit_id)
  );
drop policy if exists crew_role_own_visit_delete on public.crm_crew_member_times;
create policy crew_role_own_visit_delete on public.crm_crew_member_times as restrictive for delete
  using (
    coalesce(public.my_role(), '') <> 'crew'
    or exists (select 1 from public.crm_job_visits v where v.id = crm_crew_member_times.visit_id)
  );

-- Drive segments: a crew login may only write its own crew's.
drop policy if exists crew_role_own_crew_insert on public.crm_crew_drive_segments;
create policy crew_role_own_crew_insert on public.crm_crew_drive_segments as restrictive for insert
  with check (
    coalesce(public.my_role(), '') <> 'crew'
    or crew_id in (select public.my_crew_ids())
  );
drop policy if exists crew_role_own_crew_update on public.crm_crew_drive_segments;
create policy crew_role_own_crew_update on public.crm_crew_drive_segments as restrictive for update
  using (
    coalesce(public.my_role(), '') <> 'crew'
    or crew_id in (select public.my_crew_ids())
  )
  with check (
    coalesce(public.my_role(), '') <> 'crew'
    or crew_id in (select public.my_crew_ids())
  );
drop policy if exists crew_role_own_crew_delete on public.crm_crew_drive_segments;
create policy crew_role_own_crew_delete on public.crm_crew_drive_segments as restrictive for delete
  using (
    coalesce(public.my_role(), '') <> 'crew'
    or crew_id in (select public.my_crew_ids())
  );
