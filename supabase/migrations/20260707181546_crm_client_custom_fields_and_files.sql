-- crm_custom_field_defs had two independent, incompatible schemas depending on
-- environment: production had the rate-matrix shape (entity_type/field_key/
-- field_label/options) used by ServiceDialog's rate matrix tab, while the
-- client-facing custom fields feature (crm_client_custom_field_values,
-- client_files, clients.office_notes — from 20260620000003) was never
-- deployed there. This collision meant client custom fields (e.g. "Yards of
-- Mulch") silently failed to save on production.
--
-- Fix: split into two dedicated tables. crm_rate_matrix_field_defs takes over
-- the entity_type/field_key/field_label/options shape for rate matrix pricing
-- dimensions; crm_custom_field_defs is recreated with the name/field_type/unit
-- shape for simple client profile fields.
--
-- This migration is idempotent only in the sense that it matches what was
-- applied by hand via the Supabase MCP/CLI on 2026-07-07 — see conversation
-- history. If crm_custom_field_defs already has the rate-matrix shape when
-- this runs, rename it first; otherwise skip that step.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'crm_custom_field_defs' and column_name = 'entity_type'
  ) then
    alter table crm_custom_field_defs rename to crm_rate_matrix_field_defs;
  end if;
end $$;

create table if not exists crm_rate_matrix_field_defs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) default my_org_id(),
  entity_type text not null default 'client',
  field_key   text not null,
  field_label text not null,
  field_type  text not null default 'text',
  options     jsonb,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists crm_rate_matrix_field_defs_org_id_idx
  on crm_rate_matrix_field_defs (org_id) where deleted_at is null;
alter table crm_rate_matrix_field_defs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'crm_rate_matrix_field_defs' and policyname = 'org members can read rate matrix field defs') then
    create policy "org members can read rate matrix field defs" on crm_rate_matrix_field_defs for select using (org_id = my_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_rate_matrix_field_defs' and policyname = 'org members can insert rate matrix field defs') then
    create policy "org members can insert rate matrix field defs" on crm_rate_matrix_field_defs for insert with check (org_id = my_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_rate_matrix_field_defs' and policyname = 'org members can update rate matrix field defs') then
    create policy "org members can update rate matrix field defs" on crm_rate_matrix_field_defs for update using (org_id = my_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_rate_matrix_field_defs' and policyname = 'org members can delete rate matrix field defs') then
    create policy "org members can delete rate matrix field defs" on crm_rate_matrix_field_defs for delete using (org_id = my_org_id());
  end if;
end $$;

-- Repoint crm_property_custom_field_values at the renamed/dedicated table.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'crm_property_custom_field_values_field_def_id_fkey'
      and confrelid = 'crm_custom_field_defs'::regclass
  ) then
    alter table crm_property_custom_field_values drop constraint crm_property_custom_field_values_field_def_id_fkey;
    alter table crm_property_custom_field_values
      add constraint crm_property_custom_field_values_field_def_id_fkey
      foreign key (field_def_id) references crm_rate_matrix_field_defs(id);
  end if;
end $$;

-- Recreate crm_custom_field_defs with the client-profile-field shape
-- (this is a no-op where 20260620000003 already applied it correctly).
create table if not exists crm_custom_field_defs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  name        text not null,
  field_type  text not null default 'text' check (field_type in ('text', 'number')),
  unit        text,
  sort_order  integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists crm_custom_field_defs_org_id_idx
  on crm_custom_field_defs (org_id) where deleted_at is null;
alter table crm_custom_field_defs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'crm_custom_field_defs' and policyname = 'org members can read field defs') then
    create policy "org members can read field defs" on crm_custom_field_defs for select using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_custom_field_defs' and policyname = 'org members can insert field defs') then
    create policy "org members can insert field defs" on crm_custom_field_defs for insert with check (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_custom_field_defs' and policyname = 'org members can update field defs') then
    create policy "org members can update field defs" on crm_custom_field_defs for update using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_custom_field_defs' and policyname = 'org members can delete field defs') then
    create policy "org members can delete field defs" on crm_custom_field_defs for delete using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
end $$;

alter table clients add column if not exists office_notes text;

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
create index if not exists crm_client_custom_field_values_client_id_idx on crm_client_custom_field_values (client_id);
alter table crm_client_custom_field_values enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'crm_client_custom_field_values' and policyname = 'org members can read field values') then
    create policy "org members can read field values" on crm_client_custom_field_values for select using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_client_custom_field_values' and policyname = 'org members can insert field values') then
    create policy "org members can insert field values" on crm_client_custom_field_values for insert with check (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_client_custom_field_values' and policyname = 'org members can update field values') then
    create policy "org members can update field values" on crm_client_custom_field_values for update using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_client_custom_field_values' and policyname = 'org members can delete field values') then
    create policy "org members can delete field values" on crm_client_custom_field_values for delete using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
end $$;

create table if not exists client_files (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  client_id     uuid not null references clients(id),
  name          text not null,
  storage_path  text not null,
  size_bytes    bigint,
  mime_type     text,
  uploaded_by   uuid references profiles(id),
  deleted_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists client_files_client_id_idx on client_files (client_id) where deleted_at is null;
alter table client_files enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'client_files' and policyname = 'org members can read client files') then
    create policy "org members can read client files" on client_files for select using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'client_files' and policyname = 'org members can insert client files') then
    create policy "org members can insert client files" on client_files for insert with check (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'client_files' and policyname = 'org members can update client files') then
    create policy "org members can update client files" on client_files for update using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'client_files' and policyname = 'org members can delete client files') then
    create policy "org members can delete client files" on client_files for delete using (org_id = (select org_id from profiles where id = auth.uid()));
  end if;
end $$;
