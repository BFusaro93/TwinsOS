-- crm_crew_members.labor_burden_cents_per_hour: no direct SELECT for end users.
--
-- APPLY AFTER THE DEPLOY. The previously deployed client reads this column
-- directly (useCrews embeds crm_crew_members(*), Resource Time Utilization
-- selects it, visit-labor.ts reads it with the caller's session — crew logins
-- included) and breaks under this. The new client reads it only through
-- crm_crew_member_labor_rates() (20270103000430), which returns rates to the
-- service role and to holders of payroll_show_wage_burden only.
--
-- `authenticated` (and anon) lose table-level SELECT and get column-level
-- SELECT on every column EXCEPT labor_burden_cents_per_hour. Embeds and lists
-- that name their columns keep working; select("*") / crm_crew_members(*) from
-- an end-user session now fail, so callers must list columns. Writes are
-- unaffected (INSERT/UPDATE privileges are untouched; writing the burden needs
-- payroll_show_wage_burden per 20270103000430), but an insert/update that asks
-- for the row back must list only granted columns.
--
-- !! New crm_crew_members columns are NOT readable by `authenticated` until
--    granted: re-run the DO block below (idempotent) after adding a column.

do $$
declare
  v_sensitive constant text[] := array['labor_burden_cents_per_hour'];
  r record;
begin
  execute 'revoke select on table public.crm_crew_members from anon, authenticated';
  for r in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.crm_crew_members'::regclass
      and a.attnum > 0 and not a.attisdropped
  loop
    if r.attname = any (v_sensitive) then
      execute format('revoke select (%I) on public.crm_crew_members from anon, authenticated', r.attname);
    else
      execute format('grant select (%I) on public.crm_crew_members to authenticated', r.attname);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
