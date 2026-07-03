-- clients.first_name existed only on the test project (added by
-- 20260620000004_crm_client_name_address_lists.sql, which was never applied
-- to prod). Backfill it here so prod matches test.
alter table clients
  add column if not exists first_name text;
