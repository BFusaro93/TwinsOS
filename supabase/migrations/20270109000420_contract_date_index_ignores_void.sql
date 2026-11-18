-- crm_invoices_one_per_contract_date ignores VOID invoices.
--
-- The index (one regular invoice per contract per invoice_date) also counted
-- void invoices, so "Duplicate as draft" of a voided contract invoice the same
-- day it was dated (crm_duplicate_void_invoice dates the copy today) failed
-- with a raw 23505. Void is final, so a void row never competes with a live
-- one; the index is only the concurrency backstop between two LIVE inserts.
-- The cron / Create Invoices period checks still count a void invoice as
-- billed (they query crm_invoices without a status filter), so voiding never
-- makes the cron bill that period again.
--
-- PROD: either order. PRE-CHECK: none — the new predicate is narrower, so no
-- existing row can violate it.

drop index if exists public.crm_invoices_one_per_contract_date;
create unique index crm_invoices_one_per_contract_date
  on public.crm_invoices using btree (contract_id, invoice_date)
  where deleted_at is null
    and contract_id is not null
    and proration_period_start is null
    and catch_up_period_start is null
    and status <> 'void';
