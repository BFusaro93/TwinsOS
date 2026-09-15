-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).

-- The previous fix (20260906220000) scoped crm_reports reads to is_staff(),
-- but the page that actually displays this report
-- (src/app/(reports)/dashboards/twins-crm-report/page.tsx, gated by
-- InternalOnlyGuard -> useIsInternalOrg) checks a DIFFERENT, hardcoded
-- condition: profiles.org_id = the "Twins Lawn Service" org id -- not
-- is_staff()/is_platform_staff_org (today only true for the separate
-- "Landscapt" staff org). Since crm_reports has no org_id column of its
-- own (singleton row), the check has to be against the CALLER's own
-- profile.org_id, matching the UI gate exactly. Without this, a user
-- logged into the real Twins Lawn Service org (the intended audience for
-- this legacy report) passes the page's own access check but the RLS
-- silently returns zero rows -- an empty/broken report, not a clean
-- access-denied. This restores that access while still closing the real
-- gap: any OTHER customer org (unrelated to Twins Lawn Service or
-- Landscapt) is still blocked.
drop policy if exists "staff can read CRM reports" on public.crm_reports;
create policy "staff can read CRM reports" on public.crm_reports
  for select
  using (
    public.is_staff(auth.uid())
    or (select org_id from public.profiles where id = auth.uid()) = '619de9bb-f8f8-46cf-983c-9faf54f6a7d0'::uuid
  );
