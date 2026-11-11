-- Crew logins: no direct read of job prices (part 2 of 2).
--
-- APPLY AFTER THE APP DEPLOYS. The crew app now reads jobs and job services
-- through the price-free crew_job / crew_job_services computed relationships
-- (20261231000330) and reads job materials through server routes; older app
-- code still embeds crm_jobs(...) directly and would lose the job (and with it
-- the crew-ownership check) once this is applied.
--
-- 1. RESTRICTIVE "crew_no_select" on crm_jobs, crm_job_services and
--    crm_job_products — same pattern as projects / project_* in
--    20261230000420. These three tables carry the job rate and totals, the
--    service rates, and material price/cost; a crew login could read all of
--    them org-wide with a hand-built PostgREST query. Non-crew logins
--    (my_role() is distinct from 'crew', incl. NULL: portal, service role)
--    are unaffected.
--
--    Knock-on, by design: the rpt_* views are security_invoker, so for a crew
--    login rpt_jobs, rpt_job_services, rpt_job_visits and
--    rpt_contract_service_usage (which join these tables) now return no rows.
--    Those views expose revenue, rates and labor cost, and a crew could
--    query them directly; a dashboard flagged visible_to_crew that uses them
--    now shows crews nothing instead of prices.
--
-- 2. The crew RLS policies that resolved a visit's effective crew through
--    crm_jobs (read under the caller's RLS) use crm_job_crew_id() instead,
--    which is otherwise identical: same org check, same crew match.
--      * crm_job_visits  "crew reads own crew visits" / "crew updates own crew visits"
--      * clients         "crew can read own assigned clients"
--
-- 3. "crew updates own crew job products" is dropped: a crew can't UPDATE a
--    row it can't SELECT, and the one crew write (record materials used) now
--    goes through crew_set_job_product_qty(), which keeps the same scope.
--
-- crm_job_visits stays readable by crew (own crew's visits only): every crew
-- action writes it as the crew, and those writes need SELECT. Its two money
-- columns (rate_cents — the office's per-visit price override — and
-- actual_labor_cost_cents) remain readable for the crew's OWN visits; the app
-- never requests them, and 20261231000330 stops a crew from changing them.

-- ── 1. crew can't read the priced tables ─────────────────────────────────────
drop policy if exists crew_no_select on public.crm_jobs;
create policy crew_no_select on public.crm_jobs
  as restrictive for select
  using ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_select on public.crm_job_services;
create policy crew_no_select on public.crm_job_services
  as restrictive for select
  using ((select public.my_role()) is distinct from 'crew');

drop policy if exists crew_no_select on public.crm_job_products;
create policy crew_no_select on public.crm_job_products
  as restrictive for select
  using ((select public.my_role()) is distinct from 'crew');

-- ── 2. crew policies that read crm_jobs ──────────────────────────────────────
-- Previous definitions: 20261015000000_crew_unassigned_in_rls_and_reports.sql
-- (visits) and 20261111030000_crew_clients_policy_effective_crew.sql (clients).
drop policy if exists "crew reads own crew visits" on public.crm_job_visits;
create policy "crew reads own crew visits"
  on public.crm_job_visits for select
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) = 'crew'
    and (
      crew_id in (select public.my_crew_ids())
      or (
        crew_id is null
        and not crew_unassigned
        and public.crm_job_crew_id(job_id) in (select public.my_crew_ids())
      )
    )
  );

drop policy if exists "crew updates own crew visits" on public.crm_job_visits;
create policy "crew updates own crew visits"
  on public.crm_job_visits for update
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) = 'crew'
    and (
      crew_id in (select public.my_crew_ids())
      or (
        crew_id is null
        and not crew_unassigned
        and public.crm_job_crew_id(job_id) in (select public.my_crew_ids())
      )
    )
  )
  with check (
    org_id = (select public.my_org_id())
    and (select public.my_role()) = 'crew'
    and (
      crew_id in (select public.my_crew_ids())
      or (
        crew_id is null
        and not crew_unassigned
        and public.crm_job_crew_id(job_id) in (select public.my_crew_ids())
      )
    )
  );

drop policy if exists "crew can read own assigned clients" on public.clients;
create policy "crew can read own assigned clients"
  on public.clients for select
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) = 'crew'
    and exists (
      select 1
      from public.crm_job_visits v
      where v.client_id = clients.id
        and v.deleted_at is null
        and not v.crew_unassigned
        and coalesce(v.crew_id, public.crm_job_crew_id(v.job_id)) in (select public.my_crew_ids())
    )
  );

-- ── 3. crew job-product writes go through crew_set_job_product_qty() ─────────
drop policy if exists "crew updates own crew job products" on public.crm_job_products;
