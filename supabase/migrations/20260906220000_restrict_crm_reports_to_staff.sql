-- crm_reports is a singleton (id='latest', no org_id column) holding Twins
-- Lawn Service's own legacy internal report snapshot -- not per-org customer
-- data (see src/app/(reports)/dashboards/twins-crm-report/page.tsx, marked
-- Twins-only / scheduled for retirement). The prior `qual: true` policy let
-- ANY authenticated user of ANY customer org read Twins' own internal report
-- via a direct REST call, bypassing the app-layer staff-only gate on the
-- reports page. Writes already only ever happen via the service-role client
-- (no insert/update/delete policy exists here), so only the read needs
-- fixing. Scope it to platform staff, matching how every other staff-only
-- table in this schema is gated. Idempotent both ways so this is safe to
-- re-run on an environment where it's already applied.
drop policy if exists "Authenticated users can read CRM reports" on public.crm_reports;
drop policy if exists "staff can read CRM reports" on public.crm_reports;
create policy "staff can read CRM reports" on public.crm_reports
  for select
  using (public.is_staff(auth.uid()));
