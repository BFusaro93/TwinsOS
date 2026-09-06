-- 20260824114231_integrations_admin_only.sql restricted the 'integrations'
-- table's RLS to admin-only for provider = 'zapier', but its own comment
-- explicitly left provider = 'samsara' on the original any-org-member policy
-- ("Other providers (e.g. 'samsara', configured from Equipt Settings) keep
-- the original any-org-member behavior; tightening those isn't part of this
-- change.").
--
-- That's a bug, not an intentional scoping: use-integrations.ts
-- (useIntegration()/useUpsertIntegration()) queries/mutates this table
-- directly from the browser client with select("*"), so any authenticated
-- org member — regardless of role — can read the org's plaintext Samsara
-- API key (and overwrite/disable the integration), the same class of
-- exposure the Zapier fix addressed. Extend the same admin-only restriction
-- to 'samsara' by adding it to the provider check.
--
-- NOTE: this migration must be applied to BOTH the prod and test Supabase
-- projects per this repo's documented workflow (see
-- memory/project_supabase_environments.md) — it is NOT applied by this change.

drop policy if exists "org_members_integrations" on public.integrations;

create policy "org_members_integrations" on public.integrations
  for all
  using (
    org_id = public.my_org_id()
    and (
      provider not in ('zapier', 'samsara')
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  )
  with check (
    org_id = public.my_org_id()
    and (
      provider not in ('zapier', 'samsara')
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.org_id = public.my_org_id() and p.role = 'admin'
      )
    )
  );
