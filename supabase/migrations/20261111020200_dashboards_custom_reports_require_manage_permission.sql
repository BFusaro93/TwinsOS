-- crm_dashboards / crm_custom_reports: one "org members can do anything" ALL
-- policy let ANY user with CRM access — crew logins included — insert, rewrite
-- (including flipping visible_to_crew) or delete dashboards and custom reports
-- straight through PostgREST, while the API routes require manage_report_center
-- ("the boundary"). Same fix as 20261110070100 (report_schedules): writes now
-- need the key; reading stays open to org members with CRM access.
--
-- DEPENDS ON the code change that moves ensureSystemDashboardsSeeded() to the
-- service role (src/lib/reports/seed-dashboards.ts): it used to insert as
-- whichever view-only user loaded the list, which this policy would now
-- reject. Deploy the code with (or before) this migration.
--
-- Every RESTRICTIVE policy (require_crm_access, read_only_when_canceled_*) is
-- untouched and keeps ANDing with these permissive ones.
DROP POLICY IF EXISTS "crm_dashboards_org" ON public.crm_dashboards;
DROP POLICY IF EXISTS "crm_dashboards_select" ON public.crm_dashboards;
DROP POLICY IF EXISTS "crm_dashboards_insert" ON public.crm_dashboards;
DROP POLICY IF EXISTS "crm_dashboards_update" ON public.crm_dashboards;
DROP POLICY IF EXISTS "crm_dashboards_delete" ON public.crm_dashboards;

CREATE POLICY "crm_dashboards_select" ON public.crm_dashboards
  FOR SELECT TO public
  USING (org_id = my_org_id());

CREATE POLICY "crm_dashboards_insert" ON public.crm_dashboards
  FOR INSERT TO public
  WITH CHECK (org_id = my_org_id() AND has_settings_permission('manage_report_center'));

CREATE POLICY "crm_dashboards_update" ON public.crm_dashboards
  FOR UPDATE TO public
  USING (org_id = my_org_id() AND has_settings_permission('manage_report_center'))
  WITH CHECK (org_id = my_org_id() AND has_settings_permission('manage_report_center'));

CREATE POLICY "crm_dashboards_delete" ON public.crm_dashboards
  FOR DELETE TO public
  USING (org_id = my_org_id() AND has_settings_permission('manage_report_center'));

DROP POLICY IF EXISTS "crm_custom_reports_org" ON public.crm_custom_reports;
DROP POLICY IF EXISTS "crm_custom_reports_select" ON public.crm_custom_reports;
DROP POLICY IF EXISTS "crm_custom_reports_insert" ON public.crm_custom_reports;
DROP POLICY IF EXISTS "crm_custom_reports_update" ON public.crm_custom_reports;
DROP POLICY IF EXISTS "crm_custom_reports_delete" ON public.crm_custom_reports;

CREATE POLICY "crm_custom_reports_select" ON public.crm_custom_reports
  FOR SELECT TO public
  USING (org_id = my_org_id());

CREATE POLICY "crm_custom_reports_insert" ON public.crm_custom_reports
  FOR INSERT TO public
  WITH CHECK (org_id = my_org_id() AND has_settings_permission('manage_report_center'));

CREATE POLICY "crm_custom_reports_update" ON public.crm_custom_reports
  FOR UPDATE TO public
  USING (org_id = my_org_id() AND has_settings_permission('manage_report_center'))
  WITH CHECK (org_id = my_org_id() AND has_settings_permission('manage_report_center'));

CREATE POLICY "crm_custom_reports_delete" ON public.crm_custom_reports
  FOR DELETE TO public
  USING (org_id = my_org_id() AND has_settings_permission('manage_report_center'));
