-- crm_job_visits.actual_labor_cost_cents: no direct SELECT for end users.
--
-- APPLY AFTER THE DEPLOY. The previously deployed client reads whole visit rows
-- from user sessions (crm_job_visits `*` / bare .select() in the dispatch board,
-- snow board and invoicing, job/client visit lists, crew Start/Stop/Pause/Skip
-- routes) and breaks under this. The new code lists columns
-- (JOB_VISIT_READ_COLUMNS in src/lib/visits/visit-columns.ts) and reads labor
-- cost only through rpt_job_visits (crm_job_visit_labor_costs(), masked unless
-- crm_can_see_labor_cost(), 20270106000300) or the service role.
--
-- A one-person crew's visit labor cost divided by its hours is that person's
-- pay rate, and any login — crew included — could read it on its own visits.
--
-- `authenticated` (and anon) lose table-level SELECT and get column-level
-- SELECT on every column EXCEPT actual_labor_cost_cents (same pattern as
-- 20270103000440). Writes are unaffected: INSERT/UPDATE privileges stay, and
-- the column is written by the service role (recomputeStopLabor / clock-out)
-- and by SECURITY DEFINER rollups; an insert/update that asks for the row back
-- must list only granted columns.
--
-- The two SECURITY INVOKER RPCs that copied a whole visit row
-- (crm_add_visit_crew, crm_remove_visit_crew: `select * into v ...`) are
-- patched to select the readable columns only; the labor cost they never
-- needed comes back NULL in the copy (the add-crew clone sets it to 0 anyway).
--
-- !! New crm_job_visits columns are NOT readable by `authenticated` until
--    granted: re-run the first DO block below (idempotent) after adding one, and
--    add it to JOB_VISIT_READ_COLUMNS.
--
-- PROD pre-check — invoker functions that copy whole visit rows; expect exactly
-- crm_add_visit_crew and crm_remove_visit_crew (both patched below):
--   select p.proname from pg_proc p
--    where p.pronamespace = 'public'::regnamespace and not p.prosecdef
--      and p.prosrc ~* 'crm_job_visits' and p.prosrc ~* 'select\s+\*\s+into';

do $$
declare
  v_sensitive constant text[] := array['actual_labor_cost_cents'];
  r record;
begin
  execute 'revoke select on table public.crm_job_visits from anon, authenticated';
  for r in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.crm_job_visits'::regclass
      and a.attnum > 0 and not a.attisdropped
  loop
    if r.attname = any (v_sensitive) then
      execute format('revoke select (%I) on public.crm_job_visits from anon, authenticated', r.attname);
    else
      execute format('grant select (%I) on public.crm_job_visits to authenticated', r.attname);
    end if;
  end loop;
end $$;

-- Whole-row copies in the invoker RPCs: `select * into X from crm_job_visits <where>;`
-- becomes a select of the readable columns, rebuilt into the row type.
do $$
declare
  v_cols text;
  v_fn text;
  v_src text;
  v_new text;
  v_hits int;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into v_cols
    from pg_attribute a
   where a.attrelid = 'public.crm_job_visits'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname <> 'actual_labor_cost_cents';

  foreach v_fn in array array['public.crm_add_visit_crew(uuid,uuid)', 'public.crm_remove_visit_crew(uuid)'] loop
    if to_regprocedure(v_fn) is null then
      raise notice 'skip %: not found', v_fn;
      continue;
    end if;
    v_src := pg_get_functiondef(v_fn::regprocedure);
    v_hits := (select count(*) from regexp_matches(v_src, 'select \* into (\w+) from crm_job_visits(\s[^;]*);', 'g'));
    if v_hits = 0 then
      raise notice 'skip %: no whole-row select left', v_fn;
      continue;
    end if;
    v_new := regexp_replace(
      v_src,
      'select \* into (\w+) from crm_job_visits(\s[^;]*);',
      'select (jsonb_populate_record(null::public.crm_job_visits, to_jsonb(_jv))).* into \1 from (select ' || v_cols || ' from crm_job_visits\2) _jv;',
      'g');
    execute v_new;
    raise notice 'patched % (% whole-row selects)', v_fn, v_hits;
  end loop;
end $$;

notify pgrst, 'reload schema';
