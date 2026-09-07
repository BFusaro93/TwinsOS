-- crm_reports is a singleton (id='latest', no org_id column) holding Twins
-- Lawn Service's own legacy internal report snapshot -- not per-org customer
-- data (see src/app/(reports)/dashboards/twins-crm-report/page.tsx, marked
-- Twins-only / scheduled for retirement). The prior `qual: true` policy let
-- ANY authenticated user of ANY customer org read Twins' own internal report
-- via a direct REST call, bypassing the app-layer gate on the reports page.
-- Writes already only ever happen via the service-role client (no
-- insert/update/delete policy exists here), so only the read needs fixing.
--
-- That page's own gate (InternalOnlyGuard -> useIsInternalOrg,
-- src/lib/hooks/use-internal-org.ts) checks a hardcoded
-- profiles.org_id = <Twins Lawn Service org id> comparison -- NOT
-- is_staff()/is_platform_staff_org (which today is only true for the
-- separate "Landscapt" staff org; Brandon has a login in each). An
-- earlier version of this migration used is_staff() alone, which would
-- have passed the page's own access check for a Twins Lawn Service login
-- while the RLS silently returned zero rows underneath -- an empty/broken
-- report, not a clean access-denied. Match the UI gate exactly instead:
-- staff, OR a caller whose own profile is in the Twins Lawn Service org.
-- Idempotent both ways so this is safe to re-run on an environment where
-- it's already applied.
drop policy if exists "Authenticated users can read CRM reports" on public.crm_reports;
drop policy if exists "staff can read CRM reports" on public.crm_reports;
create policy "staff can read CRM reports" on public.crm_reports
  for select
  using (
    public.is_staff(auth.uid())
    or (select org_id from public.profiles where id = auth.uid()) = '619de9bb-f8f8-46cf-983c-9faf54f6a7d0'::uuid
  );
