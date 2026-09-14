-- 20260620000004_crm_client_name_address_lists.sql added these columns to `clients`
-- but only ever landed on the test Supabase project, never on prod (crm_list_options
-- from the same file DID land on prod, so this is a partial-apply drift, not a
-- never-ran migration). Catch prod up, then backfill service_address from the
-- existing billing_address so clients that already had a billing address show
-- something in the "Service Address" section of the client edit form instead of
-- appearing blank (billing_same_as_service defaults to true, which is why the
-- separate Billing Address section was also invisible on edit).
alter table clients
  add column if not exists last_name text,
  add column if not exists service_address text,
  add column if not exists service_city text,
  add column if not exists service_state text,
  add column if not exists service_zip text,
  add column if not exists billing_same_as_service boolean not null default true;

update clients
set service_address = billing_address,
    service_city = billing_city,
    service_state = billing_state,
    service_zip = billing_zip
where service_address is null
  and billing_address is not null;
