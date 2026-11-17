-- Labor cost columns, step 2 of 3: new columns on a column-granted table stay readable.
--
-- Safe to apply any time (before or after the deploy).
--
-- crm_crew_members (20270103000440), and after step 3 crm_jobs and
-- crm_job_visits, have no table-level SELECT for `authenticated`; each readable
-- column is granted on its own. A column a later migration adds would get no
-- grant, so every query naming it would fail with "permission denied" until
-- someone remembered to grant it. crm_jobs and crm_job_visits change often.
--
-- This event trigger grants SELECT on any newly added column of those tables
-- to `authenticated`, except the deliberately hidden ones listed below. It acts
-- only while the table really is column-granted (no table-level SELECT), so it
-- is a no-op on crm_jobs / crm_job_visits until step 3 runs. A column that
-- must stay hidden: add it to v_hidden here AND revoke it in the migration
-- that adds it (the trigger runs at the end of each ALTER TABLE).
--
-- It never blocks DDL: any error becomes a WARNING.

create or replace function public._grant_new_readable_columns()
returns event_trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_hidden constant jsonb := jsonb_build_object(
    'public.crm_crew_members', jsonb_build_array('labor_burden_cents_per_hour'),
    'public.crm_jobs',         jsonb_build_array('actual_labor_cost_cents'),
    'public.crm_job_visits',   jsonb_build_array('actual_labor_cost_cents')
  );
  r record;
  c record;
  v_name text;
begin
  for r in
    select distinct d.objid
    from pg_event_trigger_ddl_commands() d
    where d.object_type = 'table' and d.command_tag = 'ALTER TABLE'
  loop
    begin
      select n.nspname || '.' || cl.relname into v_name
      from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
      where cl.oid = r.objid;
      if v_name is null or not (v_hidden ? v_name) then
        continue;
      end if;
      if has_table_privilege('authenticated', r.objid, 'SELECT') then
        continue;  -- table-level SELECT still granted: nothing to do
      end if;
      for c in
        select a.attname
        from pg_attribute a
        where a.attrelid = r.objid and a.attnum > 0 and not a.attisdropped
          and not has_column_privilege('authenticated', r.objid, a.attnum, 'SELECT')
          and not ((v_hidden -> v_name) ? a.attname::text)
      loop
        execute format('grant select (%I) on %s to authenticated', c.attname, v_name);
      end loop;
    exception when others then
      raise warning '_grant_new_readable_columns: % (%)', sqlerrm, v_name;
    end;
  end loop;
end;
$$;

revoke all on function public._grant_new_readable_columns() from public, anon, authenticated;

drop event trigger if exists grant_new_readable_columns;
create event trigger grant_new_readable_columns
  on ddl_command_end
  when tag in ('ALTER TABLE')
  execute function public._grant_new_readable_columns();
