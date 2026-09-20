-- Crew accounts had full read AND write on the whole org's scheduling data.
--
-- has_crm_access() whitelists role 'crew' outright, and crm_job_visits'
-- permissive "org members manage visits" policy is org_id + has_crm_access()
-- FOR ALL. Permissive policies OR together, so the narrower "crew members see
-- own visits" policy never constrained anything — and that narrow policy only
-- matches the crm_employees -> crm_crew_members path anyway, which crew
-- accounts don't use (they log in as the crew itself, via crm_crews.user_id;
-- see resolveCallerCrewId in src/lib/supabase/route-auth.ts, whose own comment
-- notes "RLS on crm_job_visits only checks org_id, not crew_id").
--
-- Measured on PROD as maintenance-1@crew.equipt.app (role 'crew'):
--   * 159 of 159 visits readable — 124 belonging to other crews
--   * 44 jobs and 66 job services readable, rates up to $28,500
--   * UPDATE succeeded on all 159 visits
--   * UPDATE succeeded on crm_job_services.rate_cents for all 66 rows,
--     i.e. a field crew could silently change what customers are billed
-- (Invoices and payments were correctly blocked — 0 rows.)
--
-- This migration closes the WRITE side, which is where the damage is, and does
-- it without changing what any legitimate flow can do:
--
--   * No crew route writes crm_job_services at all — verified across every
--     route under src/app/api/crm/crew. Crew becomes read-only there.
--   * The only crew writes to crm_jobs are actual_labor_cost_cents in the two
--     clock-out routes, and both use a service-role client, which bypasses
--     RLS. Crew becomes read-only there too.
--   * Crew writes to crm_job_visits (clock-in, pause, resume, notes,
--     acknowledge, member-times, photos) go through routes that already call
--     assertCallerOwnsVisit() and only ever touch the caller's own visit, so
--     scoping the policy to the caller's own crew matches what those routes
--     already do. Crew never INSERTs or DELETEs a visit.
--
-- READ scope is deliberately left as-is. The rpt_* views are security_invoker,
-- so narrowing crew's read of crm_job_visits/crm_jobs would also change every
-- number on the crew-visible dashboards (crm_dashboards.visible_to_crew) —
-- that is a product decision, not a drive-by. What the crew *app* ships to the
-- device is now narrowed client-side instead (crewVisitSelect() in
-- src/lib/hooks/use-crew-app.ts no longer requests rate_cents when
-- crew_hide_pricing is on, and never requests the visit/job rate at all).
--
-- Residual, tracked separately: a crew user still holds a valid JWT and the
-- anon key, so a hand-crafted PostgREST query can still READ service rates for
-- the org. Closing that properly needs either a distinct Postgres role for
-- crew (column-level REVOKE cannot distinguish two users sharing the
-- `authenticated` role) or routing crew reads through service-role endpoints
-- and denying crew direct SELECT.

-- Both linkage paths, so this keeps working for orgs that assign crews through
-- employees rather than a dedicated crew login.
create or replace function public.my_crew_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select c.id
  from public.crm_crews c
  where c.user_id = auth.uid()
    and c.org_id = public.my_org_id()
  union
  select cm.crew_id
  from public.crm_crew_members cm
  join public.crm_employees e on e.id = cm.employee_id
  where e.user_id = auth.uid()
    and e.is_active = true;
$$;

revoke execute on function public.my_crew_ids() from public, anon;
grant execute on function public.my_crew_ids() to authenticated;

-- ── crm_job_visits ───────────────────────────────────────────────────────────
drop policy if exists "org members manage visits" on public.crm_job_visits;
create policy "org members manage visits"
  on public.crm_job_visits for all
  using       (org_id = my_org_id() and has_crm_access() and coalesce(my_role(), '') <> 'crew')
  with check  (org_id = my_org_id() and has_crm_access() and coalesce(my_role(), '') <> 'crew');

-- Read behaviour for crew is unchanged on purpose (see the note above).
drop policy if exists "crew reads org visits" on public.crm_job_visits;
create policy "crew reads org visits"
  on public.crm_job_visits for select
  using (org_id = my_org_id() and my_role() = 'crew');

-- ...but a crew may now only write its OWN crew's visits, and cannot hand a
-- visit to another crew (the with check re-tests crew_id on the new row).
drop policy if exists "crew updates own crew visits" on public.crm_job_visits;
create policy "crew updates own crew visits"
  on public.crm_job_visits for update
  using       (org_id = my_org_id() and my_role() = 'crew' and crew_id in (select my_crew_ids()))
  with check  (org_id = my_org_id() and my_role() = 'crew' and crew_id in (select my_crew_ids()));

-- ── crm_jobs: crew is read-only ──────────────────────────────────────────────
drop policy if exists "org members can update crm_jobs" on public.crm_jobs;
create policy "org members can update crm_jobs"
  on public.crm_jobs for update
  using (org_id = my_org_id() and has_crm_access() and coalesce(my_role(), '') <> 'crew');

drop policy if exists "org members can insert crm_jobs" on public.crm_jobs;
create policy "org members can insert crm_jobs"
  on public.crm_jobs for insert
  with check (org_id = my_org_id() and has_crm_access() and coalesce(my_role(), '') <> 'crew');

-- ── crm_job_services: crew is read-only ──────────────────────────────────────
-- This is the price-tampering vector.
drop policy if exists "org members can manage crm_job_services" on public.crm_job_services;
create policy "org members can manage crm_job_services"
  on public.crm_job_services for all
  using       (org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
               and coalesce(my_role(), '') <> 'crew')
  with check  (org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
               and coalesce(my_role(), '') <> 'crew');

drop policy if exists "crew reads job services" on public.crm_job_services;
create policy "crew reads job services"
  on public.crm_job_services for select
  using (org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid()));
