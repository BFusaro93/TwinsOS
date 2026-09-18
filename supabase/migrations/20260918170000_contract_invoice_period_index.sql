-- crm_contracts.billing_frequency allows weekly/biweekly/quarterly/annual/
-- one_time, but nothing read it: both billing paths invoiced
-- monthly_amount_cents on billing_day_of_month every single month, so an
-- "annual" contract was billed its full amount 12 times a year. The app side is
-- now frequency-aware (src/lib/contract-billing.ts).
--
-- This index was the remaining blocker for the sub-monthly cadences. Keying on
-- (contract_id, year, month) hard-caps ANY contract at one invoice per calendar
-- month, so a weekly contract would raise its first invoice and then hit a
-- 23505 for the rest of the month. Keying on the invoice date instead lets a
-- weekly contract bill weekly, while still preventing the duplicate this index
-- exists to prevent: one invoice per contract per billing date.
--
-- Monthly is unaffected. Each monthly period resolves to exactly one
-- deterministic invoice_date, and the application-level period check in
-- contract-billing.ts still enforces one invoice per month for it — this index
-- is the last-resort backstop, not the primary guard.
--
-- Verified on PROD and TEST before applying: zero existing
-- (contract_id, invoice_date) duplicates among non-deleted invoices, so the
-- unique index builds without a data fix. (All 6 live contracts are monthly
-- today, so nothing in the database changes behaviour as a result of this.)
drop index if exists public.crm_invoices_one_per_contract_month;

create unique index if not exists crm_invoices_one_per_contract_date
  on public.crm_invoices (contract_id, invoice_date)
  where deleted_at is null and contract_id is not null;
