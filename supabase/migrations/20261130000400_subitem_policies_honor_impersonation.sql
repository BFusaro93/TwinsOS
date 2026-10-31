-- crm_job_service_subitems, crm_visit_subitem_checks and estimate_template_item_subitems were created after
-- 20261103000100 with the old profiles.org_id subquery, so impersonating staff could not see their rows.
-- Re-run the same idempotent conversion (already-converted policies no longer match).
do $do$
declare
  r record;
  pat constant text := '\(\s*SELECT\s+profiles\.org_id\s+FROM\s+profiles\s+WHERE\s+\(profiles\.id\s*=\s*auth\.uid\(\)\)\s*\)';
  new_using text;
  new_check text;
  stmt text;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename not in ('profiles', 'organizations')
      and (coalesce(qual, '') ~ pat or coalesce(with_check, '') ~ pat)
  loop
    new_using := case when r.qual is null then null else regexp_replace(regexp_replace(r.qual, '\yIN\s*' || pat, '= public.my_org_id()', 'g'), pat, 'public.my_org_id()', 'g') end;
    new_check := case when r.with_check is null then null else regexp_replace(regexp_replace(r.with_check, '\yIN\s*' || pat, '= public.my_org_id()', 'g'), pat, 'public.my_org_id()', 'g') end;
    stmt := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if new_using is not null then stmt := stmt || format(' using (%s)', new_using); end if;
    if new_check is not null then stmt := stmt || format(' with check (%s)', new_check); end if;
    execute stmt;
  end loop;
end
$do$;
