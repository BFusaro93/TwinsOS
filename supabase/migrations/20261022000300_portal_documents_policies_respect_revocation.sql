-- Portal document access must respect revoked portal links and the org's
-- "documents" toggle.
--
-- "portal_user_reads_org_documents" (portal_documents) and
-- "org_portal_documents_select" (storage.objects, bucket portal-documents) both
-- granted a portal user access with only `org_id IN (client_portal_users rows
-- for auth.uid())`: no deleted_at check (a customer whose access was revoked
-- kept reading documents and minting signed URLs while their JWT was valid) and
-- no client_portal_settings.allow_documents check (turning Documents off in
-- portal settings hid the tab but not the data). Portal users can't read
-- client_portal_settings themselves, so the check lives in a SECURITY DEFINER
-- helper (text-typed so the storage policy never casts a folder name) that only
-- answers about the CALLER's own access.

create or replace function public.portal_documents_allowed(p_org_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.client_portal_users cpu
    left join public.client_portal_settings s on s.org_id = cpu.org_id
    where cpu.user_id = auth.uid()
      and cpu.org_id::text = p_org_id
      and cpu.deleted_at is null
      -- No settings row yet means the default (documents on).
      and coalesce(s.allow_documents, true)
  );
$$;

revoke all on function public.portal_documents_allowed(text) from public, anon;
grant execute on function public.portal_documents_allowed(text) to authenticated;

drop policy if exists "portal_user_reads_org_documents" on public.portal_documents;
create policy "portal_user_reads_org_documents"
  on public.portal_documents for select
  using (deleted_at is null and public.portal_documents_allowed(org_id::text));

drop policy if exists "org_portal_documents_select" on storage.objects;
create policy "org_portal_documents_select"
  on storage.objects for select
  using (
    bucket_id = 'portal-documents'
    and (
      (storage.foldername(name))[1] = (select p.org_id::text from public.profiles p where p.id = auth.uid())
      or public.portal_documents_allowed((storage.foldername(name))[1])
    )
  );
