-- Invoice PDF templates can opt in to a "Chemical Application Record" page
-- listing what was applied on each invoiced visit (product, amount, method,
-- targets, re-entry interval, applicator license). Off by default so existing
-- templates render exactly as before.
alter table public.crm_invoice_pdf_templates
  add column if not exists show_chemical_applications boolean not null default false;
