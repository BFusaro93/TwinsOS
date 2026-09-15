-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).
--
-- Byte-identical re-application of 20260824114231_integrations_admin_only.sql
-- during the 2026-08-28 incident response for the Zapier-key RLS gap (see
-- project memory "PROD security fix: integrations RLS 2026-08-28") — the
-- policy wasn't verified as actually live, so it was re-run idempotently,
-- the same "catchup" pattern as 20260828204400_fix_crm_roles_admin_only_writes_catchup.sql.

drop policy if exists "org_members_integrations" on public.integrations;

create policy "org_members_integrations" on public.integrations
  for all
  using (
    org_id = public.my_org_id()
    and (
      provider <> 'zapier'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  )
  with check (
    org_id = public.my_org_id()
    and (
      provider <> 'zapier'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  );
