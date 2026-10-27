-- Crew logins read a client only through a visit assigned to their crew. The
-- old policy matched the RAW crm_job_visits.crew_id, but a visit's crew_id is
-- usually NULL (it inherits the job's crew), so a crew login could not read
-- the client of a visit it was assigned through the job. Use the same
-- effective-crew rule as "crew reads own crew visits": the visit's own crew,
-- else the job's crew, never when the visit is pinned to "no crew"; compared
-- against my_crew_ids() (the crews this login drives today).

drop policy if exists "crew can read own assigned clients" on public.clients;
create policy "crew can read own assigned clients"
  on public.clients
  for select
  using (
    org_id = my_org_id()
    and my_role() = 'crew'
    and exists (
      select 1
      from public.crm_job_visits v
      join public.crm_jobs j on j.id = v.job_id and j.org_id = v.org_id
      where v.client_id = clients.id
        and v.deleted_at is null
        and not v.crew_unassigned
        and coalesce(v.crew_id, j.crew_id) in (select my_crew_ids())
    )
  );
