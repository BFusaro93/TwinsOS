-- Many tenant tables scope rows with (SELECT profiles.org_id FROM profiles WHERE profiles.id = auth.uid()),
-- which ignores staff impersonation: an impersonating staff member saw (and wrote to) their own org's rows.
-- my_org_id() applies the impersonation override and equals the profile org for everyone else, so swap the
-- subquery for it in place. Only the exact subquery is replaced; roles, command, permissive/restrictive and
-- every other predicate (has_crm_access(), my_role(), ...) are untouched. Idempotent: already-converted
-- policies no longer match.
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
