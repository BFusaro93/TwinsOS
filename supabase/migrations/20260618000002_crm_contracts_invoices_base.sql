-- Base tables for CRM Sprint 3 billing: contracts, invoices, invoice line items, payments.
-- These tables were created directly against the dev/test project and never captured as a
-- migration, so every later crm_contracts/crm_invoices/crm_payments migration in this repo
-- has been an ALTER against a table that doesn't exist anywhere else. This file backfills
-- the original (pre-alter) shape so those later migrations can apply cleanly in order.

create table if not exists crm_contracts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default my_org_id() references organizations(id),
  client_id           uuid not null references clients(id),
  estimate_id         uuid references estimates(id),
  title               text not null,
  status              text not null default 'draft'
                        check (status in ('draft','sent','signed','active','expired','cancelled')),
  start_date          date,
  end_date            date,
  monthly_amount_cents integer not null default 0,
  billing_frequency   text not null default 'monthly'
                        check (billing_frequency in ('weekly','biweekly','monthly','quarterly','annual','one_time')),
  auto_renew          boolean not null default false,
  notes               text,
  signed_at           timestamptz,
  signed_by           text,
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references profiles(id)
);

alter table crm_contracts enable row level security;

create policy "crm_contracts_select" on crm_contracts for select
  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_contracts_insert" on crm_contracts for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_contracts_update" on crm_contracts for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create index if not exists idx_crm_contracts_org on crm_contracts (org_id) where deleted_at is null;
create index if not exists idx_crm_contracts_client on crm_contracts (org_id, client_id) where deleted_at is null;

create trigger trg_crm_contracts_updated_at
  before update on crm_contracts
  for each row execute function set_updated_at();

-- crm_jobs.contract_id was added ahead of this table by 20260618000001; wire up the FK now.
alter table crm_jobs
  add constraint crm_jobs_contract_id_fkey foreign key (contract_id) references crm_contracts(id);

create table if not exists crm_invoices (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default my_org_id() references organizations(id),
  invoice_number integer,
  client_id      uuid not null references clients(id),
  estimate_id    uuid references estimates(id),
  crm_job_id     uuid references crm_jobs(id),
  description    text not null default '',
  status         text not null default 'draft'
                   check (status in ('draft','sent','viewed','partial','paid','overdue','void')),
  invoice_date   date not null default current_date,
  due_date       date,
  po_number      text,
  subtotal_cents integer not null default 0,
  discount_cents integer not null default 0,
  tax_rate_bps   integer not null default 0,
  tax_cents      integer not null default 0,
  total_cents    integer not null default 0,
  amount_paid_cents integer not null default 0,
  balance_cents  integer not null default 0,
  notes          text,
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references profiles(id)
);

alter table crm_invoices enable row level security;

create policy "crm_invoices_select" on crm_invoices for select
  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_invoices_insert" on crm_invoices for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_invoices_update" on crm_invoices for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create index if not exists idx_crm_invoices_org on crm_invoices (org_id) where deleted_at is null;
create index if not exists idx_crm_invoices_client on crm_invoices (org_id, client_id) where deleted_at is null;
create index if not exists idx_crm_invoices_status on crm_invoices (org_id, status) where deleted_at is null;

create trigger trg_crm_invoices_updated_at
  before update on crm_invoices
  for each row execute function set_updated_at();

create trigger trg_crm_invoices_audit
  after insert or delete or update on crm_invoices
  for each row execute function fn_audit_log();

create table if not exists crm_invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id),
  invoice_id  uuid not null references crm_invoices(id) on delete cascade,
  description text not null,
  qty         numeric not null default 1,
  rate_cents  integer not null default 0,
  total_cents integer not null default 0,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table crm_invoice_line_items enable row level security;

create policy "crm_invoice_items_select" on crm_invoice_line_items for select
  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_invoice_items_insert" on crm_invoice_line_items for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_invoice_items_update" on crm_invoice_line_items for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create index if not exists idx_crm_invoice_items_invoice on crm_invoice_line_items (invoice_id);

create trigger trg_crm_invoice_items_updated_at
  before update on crm_invoice_line_items
  for each row execute function set_updated_at();

create table if not exists crm_payments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id() references organizations(id),
  invoice_id   uuid references crm_invoices(id),
  client_id    uuid not null references clients(id),
  amount_cents integer not null,
  payment_date date not null default current_date,
  method       text not null default 'check'
                 check (method in (
                   'ACH/E-Check','AR Write-off','AutoPay','Cash','Check',
                   'Credit Card- AmEx','Credit Card- Discover','Credit Card- MasterCard',
                   'Credit Card- Visa','Other'
                 )),
  reference    text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references profiles(id)
);

alter table crm_payments enable row level security;

create policy "crm_payments_select" on crm_payments for select
  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_payments_insert" on crm_payments for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "crm_payments_update" on crm_payments for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

create index if not exists idx_crm_payments_invoice on crm_payments (invoice_id);
create index if not exists idx_crm_payments_client on crm_payments (org_id, client_id);

create trigger trg_crm_payments_updated_at
  before update on crm_payments
  for each row execute function set_updated_at();
