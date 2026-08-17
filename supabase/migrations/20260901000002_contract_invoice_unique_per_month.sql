-- Both the manual "Create Invoices" action (useGenerateContractInvoices,
-- src/lib/hooks/use-contracts.ts) and the daily cron
-- (src/app/api/cron/contract-invoices/route.ts) guard against double-billing
-- a contract for the same month with a plain SELECT-then-INSERT — a
-- double-click on "Create Invoices", two open tabs, or the manual action and
-- the cron landing in the same window can both pass the SELECT before
-- either INSERT commits, producing two invoices for the same
-- (contract, billing month). Nothing at the DB layer catches this.
--
-- A partial unique index on (contract_id, month) makes the second INSERT
-- fail instead of silently succeeding; the application code below catches
-- the unique-violation and reports it the same way as the pre-existing
-- "already billed" skip path.
create unique index if not exists crm_invoices_one_per_contract_month
  on public.crm_invoices (contract_id, (date_trunc('month', invoice_date)))
  where deleted_at is null and contract_id is not null;
