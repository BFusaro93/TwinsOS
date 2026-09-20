-- Companion to 20260918120000 (which guarded the SECURITY DEFINER RPC): close
-- the same hole on the table itself.
--
-- crm_job_products was missed by 20260910160000_crew_write_lockdown.sql. Its
-- only policies are a permissive `org_id = profiles.org_id FOR ALL` plus the
-- RESTRICTIVE require_crm_access(), and has_crm_access() whitelists role
-- 'crew' outright — so a crew JWT and the anon key could PATCH any job-product
-- row in the org directly through PostgREST, with no route or RPC involved:
-- setting qty to an arbitrary value before resolving it, or editing materials
-- on another crew's job.
--
-- Shape matches the crm_job_visits treatment in the earlier lockdown: read
-- scope for crew is deliberately left alone (the crew app and the crew-visible
-- dashboards depend on it), and only writes are narrowed, to the crew's own
-- jobs. The effective-crew fallback (visit.crew_id, else the job's crew) is the
-- same rule the RPC and the app use, because visit.crew_id is usually NULL.
--
-- The crew's legitimate flow still works: the use-materials route updates qty
-- on a still-pending row for a visit it has already ownership-checked, and that
-- visit's job is by definition one this crew is serving.

-- Helper kept inline rather than a new function: it is only needed twice here,
-- and this repo's convention is to not add a shared helper until the third use.
drop policy if exists "org members can manage crm_job_products" on public.crm_job_products;
create policy "org members can manage crm_job_products"
  on public.crm_job_products for all
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and coalesce(public.my_role(), '') <> 'crew'
  )
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and coalesce(public.my_role(), '') <> 'crew'
  );

-- Crew read scope unchanged (see note above).
drop policy if exists "crew reads org job products" on public.crm_job_products;
create policy "crew reads org job products"
  on public.crm_job_products for select
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() = 'crew'
  );

-- Crew may update only materials on a job its own crew is serving, and may not
-- move a row to another job (the with check re-tests job_id on the new row).
drop policy if exists "crew updates own crew job products" on public.crm_job_products;
create policy "crew updates own crew job products"
  on public.crm_job_products for update
  using (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() = 'crew'
    and exists (
      select 1
      from public.crm_job_visits v
      join public.crm_jobs j on j.id = v.job_id
      where v.job_id = crm_job_products.job_id
        and v.deleted_at is null
        and coalesce(v.crew_id, j.crew_id) in (select public.my_crew_ids())
    )
  )
  with check (
    org_id = (select profiles.org_id from public.profiles where profiles.id = auth.uid())
    and public.my_role() = 'crew'
    and exists (
      select 1
      from public.crm_job_visits v
      join public.crm_jobs j on j.id = v.job_id
      where v.job_id = crm_job_products.job_id
        and v.deleted_at is null
        and coalesce(v.crew_id, j.crew_id) in (select public.my_crew_ids())
    )
  );
