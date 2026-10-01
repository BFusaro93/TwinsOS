-- Invoice photos: pictures attached to an invoice that print on the invoice
-- PDF and show on the customer's online invoice page.
--
-- A photo can come from three places and is NEVER copied when it already
-- lives in storage:
--   job_photo   -> job_photos row (photo-docs module), bucket
--                  job-photos-original (or job-photos-annotated when annotated)
--   visit_photo -> crm_visit_photos row (crew app), bucket attachments
--   upload      -> uploaded directly on the invoice, bucket attachments,
--                  path {org_id}/invoice-photos/{invoice_id}/...
-- Only storage paths are stored (never signed URLs). `bucket` records which
-- bucket the path lives in so it can be signed from the right one.
--
-- Portal customers and anon have no access: the public invoice page reads
-- through a service-role route that verifies the share token first.

create table if not exists public.invoice_photos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id() references public.organizations(id),
  invoice_id   uuid not null references public.crm_invoices(id) on delete cascade,
  source       text not null check (source in ('job_photo', 'visit_photo', 'upload')),
  source_id    uuid,
  bucket       text not null default 'attachments'
               check (bucket in ('attachments', 'job-photos-original', 'job-photos-annotated')),
  storage_path text not null,
  file_name    text not null default '',
  mime_type    text,
  caption      text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid,
  deleted_at   timestamptz,
  -- uploads have no originating row; the other two must say which row
  constraint invoice_photos_source_id_chk check (source = 'upload' or source_id is not null),
  -- storage policy requires the org id as the first path segment
  constraint invoice_photos_path_org_chk check (storage_path like org_id::text || '/%')
);

create index if not exists idx_invoice_photos_invoice
  on public.invoice_photos (org_id, invoice_id, sort_order) where deleted_at is null;

-- A source photo can be attached to an invoice only once.
create unique index if not exists uq_invoice_photos_source
  on public.invoice_photos (invoice_id, source, source_id)
  where deleted_at is null and source_id is not null;

drop trigger if exists invoice_photos_set_updated_at on public.invoice_photos;
create trigger invoice_photos_set_updated_at
  before update on public.invoice_photos
  for each row execute function public.set_updated_at();

alter table public.invoice_photos enable row level security;

-- Permissive: same-org staff, never crew (shared field login) or portal users.
drop policy if exists "invoice_photos_select" on public.invoice_photos;
create policy "invoice_photos_select" on public.invoice_photos for select
  using (org_id = my_org_id()
         and public.my_role() is distinct from 'crew'
         and not public.is_client_portal_user());
drop policy if exists "invoice_photos_insert" on public.invoice_photos;
create policy "invoice_photos_insert" on public.invoice_photos for insert
  with check (org_id = my_org_id()
         and public.my_role() is distinct from 'crew'
         and not public.is_client_portal_user());
drop policy if exists "invoice_photos_update" on public.invoice_photos;
create policy "invoice_photos_update" on public.invoice_photos for update
  using (org_id = my_org_id()
         and public.my_role() is distinct from 'crew'
         and not public.is_client_portal_user())
  with check (org_id = my_org_id());
-- No DELETE policy: soft deletes only (deleted_at).

-- Restrictive: CRM access + canceled-org read-only, same as other CRM tables.
drop policy if exists "require_crm_access" on public.invoice_photos;
create policy "require_crm_access" on public.invoice_photos
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());

drop policy if exists "read_only_when_canceled_ins" on public.invoice_photos;
create policy "read_only_when_canceled_ins" on public.invoice_photos
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.invoice_photos;
create policy "read_only_when_canceled_upd" on public.invoice_photos
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_del" on public.invoice_photos;
create policy "read_only_when_canceled_del" on public.invoice_photos
  as restrictive for delete using ((select public.my_org_is_read_only()) is not true);

revoke all on public.invoice_photos from anon;
