-- Crew logins couldn't write visits whose crew is inherited from the job.
--
-- "crew updates own crew visits" (20260910160000_crew_write_lockdown.sql, not
-- restated since) matched only crew_id in my_crew_ids(). visit.crew_id is
-- usually NULL in practice — the crew lives on crm_jobs.crew_id and nothing
-- writes it down onto each generated visit — so clock-in, pause, resume,
-- notes, acknowledge and skip silently updated 0 rows on most of a crew's
-- own work (the app-side ownership check, assertCallerOwnsVisit, now resolves
-- the same effective crew and lets the request through).
--
-- Widened exactly the way 20260926160000_crew_visit_read_own_crew.sql widened
-- the READ policy: crew_id in my_crew_ids(), OR crew_id is null and the JOB's
-- crew is one of mine. Same predicate on USING and WITH CHECK, so a crew
-- still can't hand a visit to another crew (setting crew_id to someone else's
-- fails the check) or move one onto a job it doesn't own. The crm_jobs
-- subquery runs under the caller's RLS; crew has SELECT on crm_jobs and
-- crm_jobs' policies don't reference crm_job_visits, so no recursion.
--
-- Unchanged: org scoping, the role = 'crew' gate, and every other policy on
-- crm_job_visits.

drop policy if exists "crew updates own crew visits" on public.crm_job_visits;
create policy "crew updates own crew visits"
  on public.crm_job_visits for update
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
  )
  with check (
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
