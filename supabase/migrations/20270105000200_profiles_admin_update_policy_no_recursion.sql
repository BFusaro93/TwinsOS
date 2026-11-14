-- profiles UPDATE failed for every login with
--   "infinite recursion detected in policy for relation profiles"
-- (it surfaced as "Couldn't save your column layout", which saves through
-- set_ui_pref -> UPDATE profiles).
--
-- Cause: admins_manage_org_profiles checked "is the caller an admin of this
-- org" with a subquery on public.profiles inside a policy ON public.profiles.
-- Postgres refuses a policy that reads its own table. Verified on PROD by
-- dropping just that policy inside a rolled-back transaction: the UPDATE then
-- succeeds.
--
-- Fix: move the same check into a SECURITY DEFINER function (it reads
-- profiles without re-entering RLS) and call that from the policy. The check is
-- unchanged: the caller's OWN profile is an admin AND belongs to the org being
-- acted on (so a staff member impersonating another org is not an admin there).
create or replace function public.caller_is_org_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = auth.uid()
       and p.org_id = public.my_org_id()
       and p.role = 'admin'
  );
$$;

revoke execute on function public.caller_is_org_admin() from public, anon;
grant execute on function public.caller_is_org_admin() to authenticated;

drop policy if exists "admins_manage_org_profiles" on public.profiles;
create policy "admins_manage_org_profiles" on public.profiles
  for update
  using (
    org_id = (select public.my_org_id())
    and (select public.caller_is_org_admin())
  );
