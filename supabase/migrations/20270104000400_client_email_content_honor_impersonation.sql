-- client_email_content's SELECT/INSERT policies keyed on profiles.org_id, the
-- logged-in user's OWN org, while client_activity (its parent row) uses
-- my_org_id(), which honors staff impersonation. So when platform staff
-- impersonated an org and sent an email, the timeline row was written but the
-- body insert was RLS-rejected ("content wasn't saved"), and staff couldn't read
-- bodies back either. Same shape as client_activity's policies.

drop policy if exists "org members can read client_email_content" on public.client_email_content;
create policy "org members can read client_email_content" on public.client_email_content
  for select
  using (
    org_id = (select public.my_org_id())
    and (select public.has_crm_access())
  );

drop policy if exists "org members can insert client_email_content" on public.client_email_content;
create policy "org members can insert client_email_content" on public.client_email_content
  for insert
  with check (
    org_id = (select public.my_org_id())
    and (select public.has_crm_access())
  );
