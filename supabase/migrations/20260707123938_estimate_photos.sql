-- Estimate photos: pictures attached to estimates (same pattern as crm_visit_photos)

create table if not exists estimate_photos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id(),
  estimate_id  uuid not null references estimates(id) on delete cascade,
  storage_path text not null,
  file_name    text not null default '',
  file_size    integer,
  mime_type    text,
  caption      text,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table estimate_photos enable row level security;
create policy "org members select estimate photos" on estimate_photos for select using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members insert estimate photos" on estimate_photos for insert with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members update estimate photos" on estimate_photos for update using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members delete estimate photos" on estimate_photos for delete using (org_id = (select org_id from profiles where id = auth.uid()));

create index on estimate_photos (org_id, estimate_id);
