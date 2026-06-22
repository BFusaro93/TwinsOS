-- Client-level invoice defaults: default tax rate and payment terms
alter table clients
  add column if not exists default_tax_rate_bps integer not null default 0,
  add column if not exists default_terms text not null default 'due_on_receipt';

-- Store the service address on the invoice at creation time for historical accuracy
alter table crm_invoices
  add column if not exists service_address text;
