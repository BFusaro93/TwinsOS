-- Extend crm_contracts with full SA-style fields
alter table crm_contracts
  add column if not exists billing_day_of_month    integer not null default 1,
  add column if not exists bill_month_in_advance   boolean not null default false,
  add column if not exists payment_type            text,
  add column if not exists po_number               text,
  add column if not exists auto_generate           boolean not null default true,
  add column if not exists is_active               boolean not null default true,
  add column if not exists include_sub_properties  boolean not null default true,
  add column if not exists source                  text,
  add column if not exists sales_rep               text,
  add column if not exists last_billed_date        date,
  -- Jan-Dec monthly billing amounts in cents (keys: "jan".."dec")
  add column if not exists monthly_amounts         jsonb not null default '{}',
  -- Invoice description line items (array of strings)
  add column if not exists invoice_line_items      jsonb not null default '[]',
  add column if not exists default_service         text;

-- Contract notes (internal notes on a contract)
create table if not exists crm_contract_notes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id(),
  contract_id  uuid not null references crm_contracts(id) on delete cascade,
  body         text not null,
  created_by   uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table crm_contract_notes enable row level security;
create policy "org members select contract notes"  on crm_contract_notes for select  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members insert contract notes"  on crm_contract_notes for insert  with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members update contract notes"  on crm_contract_notes for update  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members delete contract notes"  on crm_contract_notes for delete  using (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_contract_notes (contract_id) where deleted_at is null;

create trigger set_crm_contract_notes_updated_at
  before update on crm_contract_notes
  for each row execute function set_updated_at();
