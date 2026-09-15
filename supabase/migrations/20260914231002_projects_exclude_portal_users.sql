-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).

create or replace function public.is_client_portal_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.client_portal_users cpu
    where cpu.user_id = auth.uid()
      and cpu.deleted_at is null
  )
  and not exists (
    select 1 from public.crm_employees ce
    where ce.user_id = auth.uid()
      and ce.deleted_at is null
  )
  and coalesce((select role from public.profiles where id = auth.uid()), '') <> 'admin';
$$;

revoke execute on function public.is_client_portal_user() from public, anon;
grant execute on function public.is_client_portal_user() to authenticated;

do $do$
declare
  t text;
begin
  foreach t in array array['projects', 'project_direct_items', 'project_subcontract_costs'] loop
    execute format('drop policy if exists %I on public.%I', 'not_client_portal_user', t);
    execute format($p$
      create policy %I on public.%I
        as restrictive for all
        using (not public.is_client_portal_user())
        with check (not public.is_client_portal_user())
    $p$, 'not_client_portal_user', t);
  end loop;
end
$do$;

do $do$
declare
  t text;
begin
  foreach t in array array['projects', 'project_direct_items', 'project_subcontract_costs'] loop
    execute format('drop policy if exists %I on public.%I', 'crew_no_insert', t);
    execute format('drop policy if exists %I on public.%I', 'crew_no_update', t);
    execute format('drop policy if exists %I on public.%I', 'crew_no_delete', t);

    execute format($p$
      create policy %I on public.%I as restrictive for insert
        with check (coalesce(public.my_role(), '') <> 'crew')
    $p$, 'crew_no_insert', t);

    execute format($p$
      create policy %I on public.%I as restrictive for update
        using      (coalesce(public.my_role(), '') <> 'crew')
        with check (coalesce(public.my_role(), '') <> 'crew')
    $p$, 'crew_no_update', t);

    execute format($p$
      create policy %I on public.%I as restrictive for delete
        using (coalesce(public.my_role(), '') <> 'crew')
    $p$, 'crew_no_delete', t);
  end loop;
end
$do$;
