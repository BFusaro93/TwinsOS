-- Client: add first/last name + separate service address
alter table clients
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists service_address text,
  add column if not exists service_city text,
  add column if not exists service_state text,
  add column if not exists service_zip text,
  add column if not exists billing_same_as_service boolean not null default true;

-- ─── crm_list_options ─────────────────────────────────────────────────────────
-- Configurable dropdown lists (client sources, contact types, etc.)
create table if not exists crm_list_options (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) default my_org_id(),
  list_name   text not null,             -- e.g. 'client_sources', 'cancellation_reasons'
  value       text not null,
  sort_order  integer not null default 0,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (org_id, list_name, value)
);

create index on crm_list_options (org_id, list_name) where deleted_at is null;

alter table crm_list_options enable row level security;

create policy "org members can read list options"
  on crm_list_options for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert list options"
  on crm_list_options for insert
  with check (org_id = my_org_id());

create policy "org members can update list options"
  on crm_list_options for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can delete list options"
  on crm_list_options for delete
  using (org_id = (select org_id from profiles where id = auth.uid()));
