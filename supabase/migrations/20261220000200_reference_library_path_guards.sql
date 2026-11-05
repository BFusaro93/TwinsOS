-- Reference Library: keep every document's file inside its own company's storage folder.
--
-- storage_path is written by the office client and the crew's /url route signs it with the
-- service role, so a row whose path pointed into another company's folder handed out that
-- company's file. The route now checks the prefix too; this makes the row itself unable to
-- point elsewhere (and a document can't be re-pointed at a different file after upload).
--
-- The storage policies read profiles.org_id, which staff impersonation doesn't change, while
-- uploads are written under my_org_id() — so impersonating staff got a 403 on upload. They also
-- let a member without a CRM seat (Equipt-only) read the files directly. Both now follow the
-- table's own rules: my_org_id() and has_crm_access().

create or replace function public.crm_reference_documents_guard_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if split_part(new.storage_path, '/', 1) is distinct from new.org_id::text then
    raise exception 'A reference document''s file must be stored in its company''s own folder'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
     and (new.storage_path is distinct from old.storage_path or new.org_id is distinct from old.org_id) then
    raise exception 'A reference document''s file and company can''t be changed — upload a new document instead'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_reference_documents_guard_path on public.crm_reference_documents;
create trigger crm_reference_documents_guard_path
  before insert or update on public.crm_reference_documents
  for each row execute function public.crm_reference_documents_guard_path();

drop policy if exists "reference_library_read" on storage.objects;
create policy "reference_library_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reference-library'
    and (storage.foldername(name))[1] = public.my_org_id()::text
    and public.has_crm_access()
  );

drop policy if exists "reference_library_upload" on storage.objects;
create policy "reference_library_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reference-library'
    and (storage.foldername(name))[1] = public.my_org_id()::text
    and public.has_crm_access()
    and public.has_settings_permission('crm_settings')
  );

drop policy if exists "reference_library_delete" on storage.objects;
create policy "reference_library_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'reference-library'
    and (storage.foldername(name))[1] = public.my_org_id()::text
    and public.has_crm_access()
    and public.has_settings_permission('crm_settings')
  );
