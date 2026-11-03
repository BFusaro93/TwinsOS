-- Reference Library: one central place for the documents a crew and the office need to hand —
-- chemical labels and Safety Data Sheets above all, plus SOPs, training material and equipment
-- lists. A document can be linked to any number of chemical products (product_ids), so a product
-- page and the crew's "View label" can find its label and SDS without each product carrying its
-- own files. Files live in the private `reference-library` bucket under {org_id}/...

create table if not exists public.crm_reference_documents (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default my_org_id() references public.organizations(id),
  category         text not null default 'sds'
                   check (category in ('sds', 'label', 'sop', 'training', 'equipment', 'other')),
  title            text not null,
  description      text,
  file_name        text not null,
  storage_path     text not null,
  mime_type        text,
  size_bytes       bigint,
  -- When the manufacturer issued this version (SDS sheets are revised; crews should see which).
  revision_date    date,
  -- product_items this document is the label / SDS / instructions for. Products are soft-deleted
  -- only, so a stale id is harmless and not worth a join table.
  product_ids      uuid[] not null default '{}',
  visible_to_crew  boolean not null default true,
  uploaded_by      uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists crm_reference_documents_org_idx
  on public.crm_reference_documents (org_id, category) where deleted_at is null;
create index if not exists crm_reference_documents_products_idx
  on public.crm_reference_documents using gin (product_ids) where deleted_at is null;

drop trigger if exists crm_reference_documents_set_updated_at on public.crm_reference_documents;
create trigger crm_reference_documents_set_updated_at
  before update on public.crm_reference_documents
  for each row execute function public.set_updated_at();

alter table public.crm_reference_documents enable row level security;

-- Anyone in the org with a CRM seat can read the library; managing it is a settings permission
-- (admins always pass). Crews reach it through the crew API, which checks the same org.
drop policy if exists "reference docs select" on public.crm_reference_documents;
create policy "reference docs select"
  on public.crm_reference_documents for select
  using (org_id = my_org_id());

drop policy if exists "reference docs insert" on public.crm_reference_documents;
create policy "reference docs insert"
  on public.crm_reference_documents for insert
  with check (org_id = my_org_id() and public.has_settings_permission('crm_settings'));

drop policy if exists "reference docs update" on public.crm_reference_documents;
create policy "reference docs update"
  on public.crm_reference_documents for update
  using (org_id = my_org_id() and public.has_settings_permission('crm_settings'))
  with check (org_id = my_org_id() and public.has_settings_permission('crm_settings'));

drop policy if exists "reference docs delete" on public.crm_reference_documents;
create policy "reference docs delete"
  on public.crm_reference_documents for delete
  using (org_id = my_org_id() and public.has_settings_permission('crm_settings'));

drop policy if exists "require_crm_access" on public.crm_reference_documents;
create policy "require_crm_access"
  on public.crm_reference_documents as restrictive for all
  using (public.has_crm_access()) with check (public.has_crm_access());

grant select, insert, update, delete on public.crm_reference_documents to authenticated;

-- Storage: private bucket, path {org_id}/{timestamp}-{filename}.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reference-library',
  'reference-library',
  false,
  52428800, -- 50MB
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain']
)
on conflict (id) do nothing;

drop policy if exists "reference_library_read" on storage.objects;
create policy "reference_library_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'reference-library'
    and (storage.foldername(name))[1] = (select org_id::text from profiles where id = auth.uid())
  );

drop policy if exists "reference_library_upload" on storage.objects;
create policy "reference_library_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'reference-library'
    and (storage.foldername(name))[1] = (select org_id::text from profiles where id = auth.uid())
    and public.has_settings_permission('crm_settings')
  );

drop policy if exists "reference_library_delete" on storage.objects;
create policy "reference_library_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'reference-library'
    and (storage.foldername(name))[1] = (select org_id::text from profiles where id = auth.uid())
    and public.has_settings_permission('crm_settings')
  );
