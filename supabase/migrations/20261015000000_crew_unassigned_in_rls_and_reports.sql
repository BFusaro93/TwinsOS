-- Make the DB-level crew checks and the visit report honor crm_job_visits.crew_unassigned
-- (added 20261010000000). Effective crew =
--   CASE WHEN crew_unassigned THEN NULL ELSE coalesce(visit.crew_id, job.crew_id) END
--
-- Before this, a visit explicitly unassigned from the job's crew was still
--   * readable/updatable by that crew's login (RLS),
--   * resolvable by that crew for its materials (set_job_product_status, crm_job_products policy),
--   * attributed to that crew in rpt_job_visits (crew name, labor rate) and the remembered
--     route order (crm_save_route_order).
--
-- The view and the two functions are patched IN PLACE from their live definitions
-- (pg_get_viewdef / pg_get_functiondef + regexp replace) so no other change in
-- them is lost to a stale copy — this repo has lost in-function permission checks
-- to careless CREATE OR REPLACE before. Each patch asserts the old expression is
-- gone afterwards and is a no-op when already applied.

-- ── policies (small; stated explicitly) ──────────────────────────────────────

drop policy if exists "crew reads own crew visits" on public.crm_job_visits;
create policy "crew reads own crew visits" on public.crm_job_visits
  for select
  using (
    org_id = my_org_id()
    and my_role() = 'crew'
    and (
      crew_id in (select my_crew_ids())
      or (
        crew_id is null
        and not crew_unassigned
        and exists (
          select 1 from crm_jobs j
          where j.id = crm_job_visits.job_id
            and j.org_id = crm_job_visits.org_id
            and j.crew_id in (select my_crew_ids())
        )
      )
    )
  );

drop policy if exists "crew updates own crew visits" on public.crm_job_visits;
create policy "crew updates own crew visits" on public.crm_job_visits
  for update
  using (
    org_id = my_org_id()
    and my_role() = 'crew'
    and (
      crew_id in (select my_crew_ids())
      or (
        crew_id is null
        and not crew_unassigned
        and exists (
          select 1 from crm_jobs j
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
        and not crew_unassigned
        and exists (
          select 1 from crm_jobs j
          where j.id = crm_job_visits.job_id
            and j.org_id = crm_job_visits.org_id
            and j.crew_id in (select my_crew_ids())
        )
      )
    )
  );

drop policy if exists "crew updates own crew job products" on public.crm_job_products;
create policy "crew updates own crew job products" on public.crm_job_products
  for update
  using (
    org_id = (select profiles.org_id from profiles where profiles.id = auth.uid())
    and my_role() = 'crew'
    and exists (
      select 1
      from crm_job_visits v
      join crm_jobs j on j.id = v.job_id
      where v.job_id = crm_job_products.job_id
        and v.deleted_at is null
        and (case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end)
            in (select my_crew_ids())
    )
  )
  with check (
    org_id = (select profiles.org_id from profiles where profiles.id = auth.uid())
    and my_role() = 'crew'
    and exists (
      select 1
      from crm_job_visits v
      join crm_jobs j on j.id = v.job_id
      where v.job_id = crm_job_products.job_id
        and v.deleted_at is null
        and (case when v.crew_unassigned then null else coalesce(v.crew_id, j.crew_id) end)
            in (select my_crew_ids())
    )
  );

-- ── functions + view: patch live definitions in place ────────────────────────

do $$
declare
  pat  constant text := 'coalesce\(\s*v\.crew_id\s*,\s*j\.crew_id\s*\)';
  repl constant text := '(CASE WHEN v.crew_unassigned THEN NULL ELSE coalesce(v.crew_id, j.crew_id) END)';
  def  text;
  newdef text;
  fn   regprocedure;
begin
  -- functions
  foreach fn in array array[
    'public.crm_save_route_order(uuid[])'::regprocedure,
    'public.set_job_product_status(uuid,text)'::regprocedure
  ] loop
    def := pg_get_functiondef(fn);
    if def !~* 'crew_unassigned' then
      newdef := regexp_replace(def, pat, repl, 'gi');
      if newdef = def then
        raise exception 'crew_unassigned patch: no effective-crew expression found in %', fn;
      end if;
      if replace(newdef, repl, '') ~* pat then
        raise exception 'crew_unassigned patch: expression still present in %', fn;
      end if;
      execute newdef;
    end if;
  end loop;

  -- view (columns unchanged, so CREATE OR REPLACE is valid; keep security_invoker)
  def := pg_get_viewdef('public.rpt_job_visits'::regclass, true);
  if def !~* 'crew_unassigned' then
    newdef := regexp_replace(def, pat, repl, 'gi');
    if newdef = def then
      raise exception 'crew_unassigned patch: no effective-crew expression found in rpt_job_visits';
    end if;
    if replace(newdef, repl, '') ~* pat then
      raise exception 'crew_unassigned patch: expression still present in rpt_job_visits';
    end if;
    execute 'create or replace view public.rpt_job_visits with (security_invoker = on) as '
            || regexp_replace(newdef, ';\s*$', '');
  end if;
end $$;
