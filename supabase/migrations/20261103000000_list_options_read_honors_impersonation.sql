-- Settings lists (tags, sources, categories...) read the caller's own profile org,
-- so a staff member impersonating a tenant saw the staff org's lists instead.
-- my_org_id() applies the impersonation override and equals the profile org otherwise.
drop policy if exists "org members can read list options" on public.crm_list_options;
create policy "org members can read list options" on public.crm_list_options
  for select
  using (org_id = public.my_org_id());
