-- Add office_notes to clients
alter table clients
  add column if not exists office_notes text;

-- ─── crm_custom_field_defs ────────────────────────────────────────────────────
-- Org-level definitions for custom client fields (takeoffs + misc)
create table if not exists crm_custom_field_defs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  name        text not null,
  field_type  text not null default 'text' check (field_type in ('text', 'number')),
  unit        text,                           -- e.g. 'sq ft', 'yards', 'ft'
  sort_order  integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index on crm_custom_field_defs (org_id) where deleted_at is null;

alter table crm_custom_field_defs enable row level security;

create policy "org members can read field defs"
  on crm_custom_field_defs for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert field defs"
  on crm_custom_field_defs for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update field defs"
  on crm_custom_field_defs for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can delete field defs"
  on crm_custom_field_defs for delete
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── crm_client_custom_field_values ──────────────────────────────────────────
create table if not exists crm_client_custom_field_values (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  client_id     uuid not null references clients(id),
  field_def_id  uuid not null references crm_custom_field_defs(id),
  value_text    text,
  value_number  numeric,
  updated_at    timestamptz not null default now(),
  unique (client_id, field_def_id)
);

create index on crm_client_custom_field_values (client_id);

alter table crm_client_custom_field_values enable row level security;

create policy "org members can read field values"
  on crm_client_custom_field_values for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert field values"
  on crm_client_custom_field_values for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update field values"
  on crm_client_custom_field_values for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can delete field values"
  on crm_client_custom_field_values for delete
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── client_files ─────────────────────────────────────────────────────────────
create table if not exists client_files (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  client_id     uuid not null references clients(id),
  name          text not null,
  storage_path  text not null,              -- path in Supabase Storage
  size_bytes    bigint,
  mime_type     text,
  uploaded_by   uuid references profiles(id),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index on client_files (client_id) where deleted_at is null;

alter table client_files enable row level security;

create policy "org members can read client files"
  on client_files for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert client files"
  on client_files for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update client files"
  on client_files for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can delete client files"
  on client_files for delete
  using (org_id = (select org_id from profiles where id = auth.uid()));
