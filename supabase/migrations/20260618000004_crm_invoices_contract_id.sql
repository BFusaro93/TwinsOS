alter table crm_invoices
  add column if not exists contract_id uuid references crm_contracts(id) on delete set null;

create index if not exists crm_invoices_contract_id_idx on crm_invoices (contract_id) where deleted_at is null;
