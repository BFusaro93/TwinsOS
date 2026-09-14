-- "service_insert_notifications" was intended for the automation engine's
-- service-role client (which bypasses RLS entirely and never needed this
-- policy to begin with), but it had no `TO service_role` clause:
--   CREATE POLICY "service_insert_notifications" ON public.notifications
--     FOR INSERT WITH CHECK (org_id = public.my_org_id());
-- With no `TO` clause a Postgres RLS policy applies to `PUBLIC` — i.e. the
-- `authenticated` role too. Any authenticated user could insert a
-- notifications row for ANY user_id (not cross-checked against org_id at
-- all — the target could even belong to a different org) with arbitrary
-- message text, spoofing a system notification in another user's bell
-- (NotificationsBell.tsx). No legitimate code path in this app inserts
-- notifications from the browser client (grep confirms every insert site
-- goes through a service-role/admin client, which bypasses RLS anyway) —
-- this policy only ever needed to exist for defense-in-depth documentation,
-- not to grant authenticated users insert rights.
drop policy if exists "service_insert_notifications" on public.notifications;
create policy "service_insert_notifications" on public.notifications
  for insert
  to service_role
  with check (org_id = public.my_org_id());
