-- Add invoice terms and per-line-item taxable flag
-- Also add is_taxable to crm_services for default per-service setting

alter table crm_invoices
  add column if not exists terms text default 'due_on_receipt';

alter table crm_invoice_line_items
  add column if not exists is_taxable boolean not null default false;

alter table crm_services
  add column if not exists is_taxable boolean not null default false;
