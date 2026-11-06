-- Rate-matrix pricing was writable by any CRM login, including shared crew
-- logins: "org members manage service rate matrix" was FOR ALL on org_id only,
-- so one update repriced every matrix-priced job and estimate. crm_services
-- itself already requires service_edit / scheduling_settings to change.
--
-- Reads stay org-wide (estimates, jobs and the dispatch board price from it).
-- Writes follow the services catalog: scheduling_settings or service_edit, plus
-- service_bulk_price for UPDATEs (Bulk Prices rewrites rate_cents in place).
-- The field definitions are only ever written by migrations and the SECURITY
-- DEFINER client-field mirror trigger, so their writes need the catalog keys too.

drop policy if exists "org members manage service rate matrix" on public.crm_service_rate_matrix;
drop policy if exists "org members read service rate matrix" on public.crm_service_rate_matrix;
drop policy if exists "settings_permission_insert_rate_matrix" on public.crm_service_rate_matrix;
drop policy if exists "settings_permission_update_rate_matrix" on public.crm_service_rate_matrix;
drop policy if exists "settings_permission_delete_rate_matrix" on public.crm_service_rate_matrix;

create policy "org members read service rate matrix" on public.crm_service_rate_matrix
  for select
  using (org_id = public.my_org_id());

create policy "settings_permission_insert_rate_matrix" on public.crm_service_rate_matrix
  for insert
  with check (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')));

create policy "settings_permission_update_rate_matrix" on public.crm_service_rate_matrix
  for update
  using (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')
         or public.has_settings_permission('service_bulk_price')))
  with check (org_id = public.my_org_id());

create policy "settings_permission_delete_rate_matrix" on public.crm_service_rate_matrix
  for delete
  using (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')));

drop policy if exists "org members insert custom field defs" on public.crm_rate_matrix_field_defs;
drop policy if exists "org members update custom field defs" on public.crm_rate_matrix_field_defs;
drop policy if exists "org members delete custom field defs" on public.crm_rate_matrix_field_defs;
drop policy if exists "settings_permission_insert_rate_field_defs" on public.crm_rate_matrix_field_defs;
drop policy if exists "settings_permission_update_rate_field_defs" on public.crm_rate_matrix_field_defs;
drop policy if exists "settings_permission_delete_rate_field_defs" on public.crm_rate_matrix_field_defs;

create policy "settings_permission_insert_rate_field_defs" on public.crm_rate_matrix_field_defs
  for insert
  with check (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')));

create policy "settings_permission_update_rate_field_defs" on public.crm_rate_matrix_field_defs
  for update
  using (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')))
  with check (org_id = public.my_org_id());

create policy "settings_permission_delete_rate_field_defs" on public.crm_rate_matrix_field_defs
  for delete
  using (org_id = public.my_org_id()
    and (public.has_settings_permission('scheduling_settings') or public.has_settings_permission('service_edit')));
