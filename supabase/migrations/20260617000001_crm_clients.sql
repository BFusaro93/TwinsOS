-- CRM Module: Sprint 1
-- Tables: clients, client_properties, client_contacts, client_tags, client_activity

-- ─── clients ──────────────────────────────────────────────────────────────────
create table if not exists clients (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  display_name        text not null,                      -- billing/display name
  account_type        text not null default 'residential'
                        check (account_type in ('residential','commercial')),
  status              text not null default 'active'
                        check (status in ('active','inactive','lead','cancelled')),
  -- primary contact info (duplicated from contacts for quick access)
  primary_phone       text,
  primary_email       text,
  -- billing
  billing_address     text,
  billing_city        text,
  billing_state       text,
  billing_zip         text,
  billing_country     text default 'US',
  billing_email       text,
  invoice_frequency   text default 'daily'
                        check (invoice_frequency in ('daily','weekly','monthly','upon_completion')),
  invoice_delivery    text default 'email'
                        check (invoice_delivery in ('email','print','both')),
  payment_method      text,                               -- 'check','credit_card','ach'
  billing_terms       text,                               -- 'due_on_receipt','net_30', etc.
  is_taxable          boolean not null default true,
  sales_tax_code      text,
  -- salesperson / acquisition
  sales_rep_id        uuid references profiles(id),
  source              text,                               -- 'BNI','referral','google', etc.
  referred_by         text,
  client_since        date,
  -- property measurements (default / master property)
  turf_sqft           numeric,
  mulch_bed_sqft      numeric,
  gross_sqft          numeric,
  linear_ft_perimeter numeric,
  linear_ft_edging    numeric,
  yards_of_mulch      numeric,
  -- operational
  gate_lock_code      text,
  notes_to_crew       text,
  map_code            text,
  priority            text check (priority in ('low','normal','high')),
  ok_to_email         boolean not null default true,
  -- AR snapshot (denormalized for quick display; updated by triggers)
  balance_outstanding_cents integer not null default 0,
  balance_uninvoiced_cents  integer not null default 0,
  balance_credits_cents     integer not null default 0,
  balance_prepay_cents      integer not null default 0,
  -- parent/child commercial hierarchy
  parent_client_id    uuid references clients(id),
  -- soft delete + audit
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references profiles(id)
);

create index on clients (org_id) where deleted_at is null;
create index on clients (org_id, status) where deleted_at is null;
create index on clients (org_id, parent_client_id) where deleted_at is null;

alter table clients enable row level security;

create policy "org members can read clients"
  on clients for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert clients"
  on clients for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update clients"
  on clients for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── client_properties ────────────────────────────────────────────────────────
-- A client can have multiple service properties (e.g. a commercial manager with
-- several locations). The "master" property is the client record itself.
create table if not exists client_properties (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  client_id           uuid not null references clients(id),
  name                text,                               -- e.g. "Main Office", "Back Lot"
  address             text,
  city                text,
  state               text,
  zip                 text,
  country             text default 'US',
  -- measurements / takeoffs
  turf_sqft           numeric,
  mulch_bed_sqft      numeric,
  gross_sqft          numeric,
  linear_ft_perimeter numeric,
  linear_ft_edging    numeric,
  yards_of_mulch      numeric,
  parking_lot_sqft    numeric,
  -- zones stored as jsonb array: [{name, type, sqft, notes}]
  zones               jsonb not null default '[]',
  -- operational
  gate_lock_code      text,
  notes_to_crew       text,
  map_code            text,
  is_master           boolean not null default false,     -- the primary/billing property
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references profiles(id)
);

create index on client_properties (org_id, client_id) where deleted_at is null;

alter table client_properties enable row level security;

create policy "org members can read client_properties"
  on client_properties for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert client_properties"
  on client_properties for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update client_properties"
  on client_properties for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── client_contacts ──────────────────────────────────────────────────────────
create table if not exists client_contacts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  client_id           uuid not null references clients(id),
  first_name          text not null,
  last_name           text,
  contact_type        text,                               -- 'owner','manager','billing', etc.
  phone               text,
  phone_type          text,                               -- 'cell','home','work'
  email               text,
  is_primary          boolean not null default false,
  ok_to_email         boolean not null default true,
  notes               text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references profiles(id)
);

create index on client_contacts (org_id, client_id) where deleted_at is null;

alter table client_contacts enable row level security;

create policy "org members can read client_contacts"
  on client_contacts for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert client_contacts"
  on client_contacts for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update client_contacts"
  on client_contacts for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── client_tags ──────────────────────────────────────────────────────────────
create table if not exists client_tags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  client_id   uuid not null references clients(id),
  tag         text not null,
  created_at  timestamptz not null default now(),
  created_by  uuid references profiles(id),
  unique (org_id, client_id, tag)
);

create index on client_tags (org_id, client_id);

alter table client_tags enable row level security;

create policy "org members can manage client_tags"
  on client_tags for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── client_activity ──────────────────────────────────────────────────────────
-- Unified chronological timeline for the client detail page.
-- Rows are inserted by the app (notes, calls) or by triggers (invoices, jobs, emails).
create table if not exists client_activity (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  client_id     uuid not null references clients(id),
  activity_type text not null
                  check (activity_type in (
                    'note','call','email','invoice','payment',
                    'job_visit','estimate','contract','automation'
                  )),
  subject       text,
  body          text,
  amount_cents  integer,                   -- for invoice/payment rows
  status        text,                      -- 'open','paid','closed', etc.
  -- links to other records
  ref_id        uuid,                      -- foreign key to the relevant record
  ref_table     text,                      -- 'invoices','jobs','estimates', etc.
  -- for emails specifically
  sent_to       text,
  delivered_at  timestamptz,
  -- audit
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  created_by    uuid references profiles(id)
);

create index on client_activity (org_id, client_id, occurred_at desc) where true;

alter table client_activity enable row level security;

create policy "org members can read client_activity"
  on client_activity for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert client_activity"
  on client_activity for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update client_activity"
  on client_activity for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── updated_at triggers ──────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Only create triggers if they don't already exist
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_clients_updated_at') then
    create trigger set_clients_updated_at
      before update on clients
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_client_properties_updated_at') then
    create trigger set_client_properties_updated_at
      before update on client_properties
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_client_contacts_updated_at') then
    create trigger set_client_contacts_updated_at
      before update on client_contacts
      for each row execute function set_updated_at();
  end if;
end;
$$;
