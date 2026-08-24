-- integrations (Zapier/Samsara API keys, etc.) was readable and writable by
-- ANY org member via RLS ("org_members_integrations": for all using/with
-- check (org_id = my_org_id())) — no role check. Master Account Settings'
-- Zapier card (and use-integrations.ts) reads/writes this table directly
-- from the browser client, so any non-admin login could read the org's
-- plaintext Zapier API key (which grants org-wide write access via the
-- Zapier actions endpoints) or overwrite/disable it, completely bypassing
-- the admin-only check already enforced in POST /api/integrations/zapier.
--
-- Scoped to the 'zapier' provider specifically — that's the one that lives
-- in (admin-only) Master Account Settings and grants broad org-wide API
-- access. Other providers (e.g. 'samsara', configured from Equipt Settings)
-- keep the original any-org-member behavior; tightening those isn't part of
-- this change. Same admin-check pattern as
-- 20260901000004_crm_roles_admin_only_writes.sql.

drop policy if exists "org_members_integrations" on public.integrations;

create policy "org_members_integrations" on public.integrations
  for all
  using (
    org_id = public.my_org_id()
    and (
      provider <> 'zapier'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  )
  with check (
    org_id = public.my_org_id()
    and (
      provider <> 'zapier'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  );
