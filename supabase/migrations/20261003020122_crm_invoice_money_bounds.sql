-- Invoices accepted a 250% tax rate and a negative discount through the
-- editor. The UI and useUpdateInvoiceFinancials now clamp; these constraints
-- are the backstop. NOT VALID: enforced for new writes without failing on
-- historical rows (a sandbox invoice already violates the tax bound).
alter table crm_invoices drop constraint if exists crm_invoices_tax_rate_bps_range;
alter table crm_invoices
  add constraint crm_invoices_tax_rate_bps_range
  check (tax_rate_bps between 0 and 10000) not valid;

alter table crm_invoices drop constraint if exists crm_invoices_discount_nonneg;
alter table crm_invoices
  add constraint crm_invoices_discount_nonneg
  check (discount_cents >= 0) not valid;
