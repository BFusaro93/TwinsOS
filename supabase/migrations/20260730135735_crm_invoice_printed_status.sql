-- Add "printed" as a distinct invoice status between draft and sent, so printing
-- a paper invoice (no email involved) moves it out of "draft" the same way emailing
-- does. Idempotent: safe to re-run.
alter table crm_invoices drop constraint if exists crm_invoices_status_check;
alter table crm_invoices add constraint crm_invoices_status_check
  check (status in ('draft','printed','sent','viewed','partial','paid','overdue','void'));
