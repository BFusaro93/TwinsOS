-- report_schedules: the single "org members can manage" ALL policy let ANY user
-- with CRM access insert/update/delete schedules straight through PostgREST.
-- The API routes require manage_report_center, but the route comments call
-- themselves "the boundary" while RLS did not agree, so a view-only role could
-- (a) point a daily PDF at any external address and (b) edit or disable
-- schedules other people set up. Writes now need the same permission the API
-- enforces; reading stays open to org members with CRM access (the restrictive
-- require_crm_access / read_only_when_canceled_* policies are untouched).
DROP POLICY IF EXISTS "org members can manage report_schedules" ON public.report_schedules;
DROP POLICY IF EXISTS "report_schedules_select" ON public.report_schedules;
DROP POLICY IF EXISTS "report_schedules_insert" ON public.report_schedules;
DROP POLICY IF EXISTS "report_schedules_update" ON public.report_schedules;
DROP POLICY IF EXISTS "report_schedules_delete" ON public.report_schedules;

CREATE POLICY "report_schedules_select" ON public.report_schedules
  FOR SELECT TO public
  USING (org_id = my_org_id());

CREATE POLICY "report_schedules_insert" ON public.report_schedules
  FOR INSERT TO public
  WITH CHECK (org_id = my_org_id() AND has_settings_permission('manage_report_center'));

CREATE POLICY "report_schedules_update" ON public.report_schedules
  FOR UPDATE TO public
  USING (org_id = my_org_id() AND has_settings_permission('manage_report_center'))
  WITH CHECK (org_id = my_org_id() AND has_settings_permission('manage_report_center'));

CREATE POLICY "report_schedules_delete" ON public.report_schedules
  FOR DELETE TO public
  USING (org_id = my_org_id() AND has_settings_permission('manage_report_center'));
