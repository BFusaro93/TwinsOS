-- Labor cost columns, step 3 of 3: end users can't read stored labor cost.
--
-- APPLY AFTER THE DEPLOY. The previously deployed app embeds
-- crm_jobs:crew_job(...) on crm_job_visits (whole-row → 403 for every crew
-- screen once a column is revoked) and reads crm_jobs / crm_job_visits with
-- select("*") on the dispatch board, job detail and snow invoicing.
--
-- Pre-checks (both must hold):
--   * 20270107000100 and 20270107000200 are applied;
--   * the deployed app reads crew visits from crm_crew_job_visits
--     (src/lib/visits/visit-columns.ts → CREW_VISITS_VIEW).
--
-- For a one-person crew, labor cost ÷ hours is that person's pay rate, and
-- every org login (crew included) could read both columns over the REST API.
-- Reports already read them masked (rpt_job_visits / rpt_projects_wip through
-- crm_job_visit_labor_costs() and crm_can_see_labor_cost(), 20270106000300).
-- Writers are the service role (clock-out, recomputeStopLabor) and definer
-- triggers (crm_job_visits_rollup_job_labor), which keep full access; INSERT
-- and UPDATE privileges are untouched.
--
-- `authenticated` (and anon) lose table-level SELECT on crm_jobs and
-- crm_job_visits and get column-level SELECT on every column EXCEPT
-- actual_labor_cost_cents — the crm_crew_members pattern (20270103000440).
-- From an end-user session, select("*"), crm_jobs(*), crm_job_visits(*), a bare
-- .select() after insert/update, and any whole-row reference now fail; list
-- columns instead (JOB_VISIT_READ_COLUMNS / JOB_READ_COLUMNS). New columns
-- are granted automatically by the grant_new_readable_columns event trigger
-- (20270107000200).
--
-- Rollback: `grant select on public.crm_jobs, public.crm_job_visits to
-- authenticated;` restores the old access in one statement.

-- The crm_job_visits overload of crew_job is unusable from here on (its
-- whole-row argument includes the revoked column); the app uses the
-- crm_crew_job_visits one.
drop function if exists public.crew_job(public.crm_job_visits);

do $$
declare
  v_sensitive constant text[] := array['actual_labor_cost_cents'];
  v_table regclass;
  r record;
begin
  foreach v_table in array array['public.crm_jobs'::regclass, 'public.crm_job_visits'::regclass]
  loop
    execute format('revoke select on table %s from anon, authenticated', v_table);
    for r in
      select a.attname
      from pg_attribute a
      where a.attrelid = v_table
        and a.attnum > 0 and not a.attisdropped
    loop
      if r.attname = any (v_sensitive) then
        execute format('revoke select (%I) on %s from anon, authenticated', r.attname, v_table);
      else
        execute format('grant select (%I) on %s to authenticated', r.attname, v_table);
      end if;
    end loop;
  end loop;
end $$;

notify pgrst, 'reload schema';
