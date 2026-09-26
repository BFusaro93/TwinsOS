-- Crew logins could read EVERY crew's visits in their org.
--
-- "crew reads org visits" was org_id + my_role() = 'crew' — deliberately left
-- org-wide by 20260910160000_crew_write_lockdown.sql, which closed the write
-- side only. That left a crew tablet able to pull every other crew's route:
-- clients, addresses, notes, and the visit-level rate_cents/qty columns.
--
-- This narrows the READ to the caller's own crew(s):
--   * crew_id in my_crew_ids() — covers both linkage paths (crew login via
--     crm_crews.user_id, and employee -> crm_crew_members), same helper the
--     "crew updates own crew visits" policy already uses;
--   * OR, for visits whose own crew_id is null, the JOB's crew. visit.crew_id
--     is usually null in practice — the crew lives on crm_jobs.crew_id — so
--     without this fallback a crew would lose sight of most of its own work.
--     The crm_jobs subquery is evaluated under the caller's RLS; crew already
--     has SELECT on crm_jobs (org_id + has_crm_access()), and crm_jobs'
--     policies don't reference crm_job_visits, so there's no recursion.
--
-- Every crew-app path was checked against this:
--   * useMyCrewVisits / useStopDetail / GET /api/crm/crew/visits already filter
--     crew_id = the caller's crew, a strict subset of what this allows.
--   * Every /api/crm/crew/** action route loads the visit then requires
--     assertCallerOwnsVisit() (visit.crew_id === caller's crew), and the stop
--     routes' sibling sweeps filter to r.crew_id === anchor.crew_id.
--   * The one read that genuinely needed other crews' rows — the job-level
--     actual_labor_cost_cents rollup in both crew clock-out routes — now uses
--     the service client (it was also silently failing its crm_jobs UPDATE,
--     which crew can't do).
--   * Completion side effects already run under the service client.
--
-- Knock-on (intended): the rpt_* views are security_invoker, so any dashboard
-- flagged crm_dashboards.visible_to_crew now shows crew their own crew's
-- numbers only. None are flagged on PROD as of 2026-09-26.
--
-- NOT addressed here: row-level policies can't hide columns, so a crew still
-- sees rate_cents/qty on ITS OWN visits via a hand-built PostgREST query. The
-- app no longer requests those columns (crewVisitSelect()); closing it at the
-- DB needs a separate Postgres role for crew or service-role-only crew reads.
--
-- Scope: only this one policy. The office policy ("org members manage
-- visits", excludes role 'crew'), the employee-path "crew members see own
-- visits", the portal policy and the crew UPDATE policy are unchanged.

drop policy if exists "crew reads org visits" on public.crm_job_visits;
drop policy if exists "crew reads own crew visits" on public.crm_job_visits;
create policy "crew reads own crew visits"
  on public.crm_job_visits for select
  using (
    org_id = my_org_id()
    and my_role() = 'crew'
    and (
      crew_id in (select my_crew_ids())
      or (
        crew_id is null
        and exists (
          select 1
          from public.crm_jobs j
          where j.id = crm_job_visits.job_id
            and j.org_id = crm_job_visits.org_id
            and j.crew_id in (select my_crew_ids())
        )
      )
    )
  );
