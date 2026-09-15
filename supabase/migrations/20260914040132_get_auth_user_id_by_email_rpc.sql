-- Portal registration (src/app/api/portal/register/route.ts) needs to look
-- up an existing auth.users id by email when admin.createUser() fails with
-- "already registered" — the person accepting this invite is already a
-- portal (or staff) user under a different account, and the fix for
-- multi-org portal support is to link a second client_portal_users row to
-- their EXISTING auth user rather than fail registration outright.
-- supabase-js's admin.listUsers() has no email filter in this SDK version,
-- so this does the lookup directly against auth.users. SECURITY DEFINER,
-- callable only by service_role — never exposed to anon/authenticated, so
-- it can't be used as an email-enumeration oracle from the client.
create or replace function public.get_auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function public.get_auth_user_id_by_email(text) from public, anon, authenticated;
