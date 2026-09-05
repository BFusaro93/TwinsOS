-- KPI Scorecard: reading needs org membership; writing (layout, targets,
-- manual actuals) needs the crm_roles "Manage Report Center" permission —
-- the same key that gates building Custom Dashboards and custom analyses.
-- has_settings_permission() already returns true for org admins. Mirrors the
-- settings-table pattern in 20260829080000_settings_permission_gate_rls.sql.

-- crm_kpi_scorecards ---------------------------------------------------------
drop policy if exists "crm_kpi_scorecards_org" on crm_kpi_scorecards;

drop policy if exists "crm_kpi_scorecards_select" on crm_kpi_scorecards;
create policy "crm_kpi_scorecards_select" on crm_kpi_scorecards
  for select using (org_id = public.my_org_id());

drop policy if exists "crm_kpi_scorecards_insert" on crm_kpi_scorecards;
create policy "crm_kpi_scorecards_insert" on crm_kpi_scorecards
  for insert
  with check (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'));

drop policy if exists "crm_kpi_scorecards_update" on crm_kpi_scorecards;
create policy "crm_kpi_scorecards_update" on crm_kpi_scorecards
  for update
  using (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'))
  with check (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'));

drop policy if exists "crm_kpi_scorecards_delete" on crm_kpi_scorecards;
create policy "crm_kpi_scorecards_delete" on crm_kpi_scorecards
  for delete
  using (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'));

-- crm_kpi_scorecard_entries --------------------------------------------------
drop policy if exists "crm_kpi_scorecard_entries_org" on crm_kpi_scorecard_entries;

drop policy if exists "crm_kpi_scorecard_entries_select" on crm_kpi_scorecard_entries;
create policy "crm_kpi_scorecard_entries_select" on crm_kpi_scorecard_entries
  for select using (org_id = public.my_org_id());

drop policy if exists "crm_kpi_scorecard_entries_insert" on crm_kpi_scorecard_entries;
create policy "crm_kpi_scorecard_entries_insert" on crm_kpi_scorecard_entries
  for insert
  with check (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'));

drop policy if exists "crm_kpi_scorecard_entries_update" on crm_kpi_scorecard_entries;
create policy "crm_kpi_scorecard_entries_update" on crm_kpi_scorecard_entries
  for update
  using (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'))
  with check (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'));

drop policy if exists "crm_kpi_scorecard_entries_delete" on crm_kpi_scorecard_entries;
create policy "crm_kpi_scorecard_entries_delete" on crm_kpi_scorecard_entries
  for delete
  using (org_id = public.my_org_id() and public.has_settings_permission('manage_report_center'));
