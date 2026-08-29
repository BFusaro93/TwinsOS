-- Continuation of 20260829080000_settings_permission_gate_rls.sql — three
-- more tables backing LandscaptSettingsTabs.tsx tabs had the same gap (RLS
-- only checked org_id, not the tab's settings_access permission key).

-- crm_estimate_stages (Estimates tab → accounting_settings) and
-- crm_overhead_settings (Overhead Recovery, same tab → accounting_settings).
drop policy if exists "org members manage estimate stages" on public.crm_estimate_stages;
create policy "org members select estimate stages" on public.crm_estimate_stages
  for select
  using (org_id = public.my_org_id());
create policy "settings_permission_write_estimate_stages" on public.crm_estimate_stages
  for insert
  with check (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));
create policy "settings_permission_update_estimate_stages" on public.crm_estimate_stages
  for update
  using (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));
create policy "settings_permission_delete_estimate_stages" on public.crm_estimate_stages
  for delete
  using (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));

drop policy if exists "org members manage overhead settings" on public.crm_overhead_settings;
create policy "org members select overhead settings" on public.crm_overhead_settings
  for select
  using (org_id = public.my_org_id());
create policy "settings_permission_write_overhead_settings" on public.crm_overhead_settings
  for insert
  with check (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));
create policy "settings_permission_update_overhead_settings" on public.crm_overhead_settings
  for update
  using (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));

-- crm_list_options is shared across several settings tabs (CRMTab,
-- EstimatesTab, ServicesTab, AccountingTab), discriminated by its own
-- list_name column — a single permission key would either lock out a
-- legitimate editor or leave another list_name's writes ungated, so the
-- required key is looked up per-list_name instead of hardcoded.
create or replace function public.settings_permission_for_list_name(p_list_name text)
returns text
language sql
immutable
as $$
  select case p_list_name
    when 'cancellation_reasons' then 'crm_settings'
    when 'contact_types'        then 'crm_settings'
    when 'client_sources'       then 'crm_settings'
    when 'client_tags'          then 'crm_settings'
    when 'ticket_categories'    then 'crm_settings'
    when 'estimate_reasons'     then 'accounting_settings'
    when 'service_categories'   then 'scheduling_settings'
    when 'payment_methods'      then 'accounting_settings'
    -- Any list_name not yet used by a settings tab (or added later) falls
    -- back to crm_settings rather than an unrestricted default.
    else 'crm_settings'
  end;
$$;

drop policy if exists "org members can insert list options" on public.crm_list_options;
drop policy if exists "org members can update list options" on public.crm_list_options;
drop policy if exists "org members can delete list options" on public.crm_list_options;
create policy "settings_permission_insert_list_options" on public.crm_list_options
  for insert
  with check (
    org_id = public.my_org_id()
    and public.has_settings_permission(public.settings_permission_for_list_name(list_name))
  );
create policy "settings_permission_update_list_options" on public.crm_list_options
  for update
  using (
    org_id = public.my_org_id()
    and public.has_settings_permission(public.settings_permission_for_list_name(list_name))
  );
create policy "settings_permission_delete_list_options" on public.crm_list_options
  for delete
  using (
    org_id = public.my_org_id()
    and public.has_settings_permission(public.settings_permission_for_list_name(list_name))
  );
