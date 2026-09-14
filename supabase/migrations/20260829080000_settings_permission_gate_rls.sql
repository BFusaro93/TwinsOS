-- LandscaptSettingsTabs.tsx gates each settings tab by one of 5 permission
-- keys (account_settings/company_settings/crm_settings/scheduling_settings/
-- accounting_settings, stored per-role as flat JSONB on crm_roles.permissions
-- — see src/types/crm-roles.ts and src/lib/permissions/settings-access.ts)
-- but that gate was UI-only: the underlying tables' RLS only ever checked
-- org_id, so any authenticated org member (including a user with NO
-- settings_access permissions at all) could write to them directly via the
-- Supabase client, bypassing the tab entirely. Same class of bug as the
-- crm_roles and approval_flows admin-only-writes fixes.
--
-- Worse, `organizations`' own UPDATE policy was literally named
-- "admins_update_own_org" but never actually checked role='admin' — any org
-- member could rewrite the org's name, branding, tax rate, or any other
-- org-wide setting.
--
-- has_settings_permission() mirrors the app's own can()/isAdmin logic
-- (src/lib/hooks/use-permissions.ts): admins always pass; everyone else
-- needs an active crm_employees link to a non-deleted crm_roles row whose
-- permissions JSONB has the given key set true.

create or replace function public.has_settings_permission(p_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_permissions jsonb;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'admin' then
    return true;
  end if;

  select cr.permissions into v_permissions
  from public.crm_employees ce
  join public.crm_roles cr on cr.id = ce.crm_role_id
  where ce.user_id = auth.uid()
    and ce.deleted_at is null
    and cr.deleted_at is null;

  if v_permissions is null then
    return false;
  end if;

  return coalesce((v_permissions ->> p_key)::boolean, false);
end;
$$;

-- organizations: touched by the General tab (company_settings) and by
-- several crm_settings-gated tabs (chemical tracking, required fields,
-- integrations, client portal) via its customizations JSONB column — RLS
-- can't enforce per-column permissions, so require either.
drop policy if exists "admins_update_own_org" on public.organizations;
create policy "settings_permission_update_org" on public.organizations
  for update
  using (
    id = public.my_org_id()
    and (public.has_settings_permission('company_settings') or public.has_settings_permission('crm_settings'))
  );

-- crm_services: the Services tab, gated by scheduling_settings.
drop policy if exists "org members can manage crm_services" on public.crm_services;
create policy "org members select crm_services" on public.crm_services
  for select
  using (org_id = public.my_org_id());
create policy "settings_permission_write_crm_services" on public.crm_services
  for insert
  with check (org_id = public.my_org_id() and public.has_settings_permission('scheduling_settings'));
create policy "settings_permission_update_crm_services" on public.crm_services
  for update
  using (org_id = public.my_org_id() and public.has_settings_permission('scheduling_settings'));
create policy "settings_permission_delete_crm_services" on public.crm_services
  for delete
  using (org_id = public.my_org_id() and public.has_settings_permission('scheduling_settings'));

-- crm_discounts: the Estimates/Accounting tabs, gated by accounting_settings.
drop policy if exists "org members insert discounts" on public.crm_discounts;
drop policy if exists "org members update discounts" on public.crm_discounts;
drop policy if exists "org members delete discounts" on public.crm_discounts;
create policy "settings_permission_insert_discounts" on public.crm_discounts
  for insert
  with check (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));
create policy "settings_permission_update_discounts" on public.crm_discounts
  for update
  using (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));
create policy "settings_permission_delete_discounts" on public.crm_discounts
  for delete
  using (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));
