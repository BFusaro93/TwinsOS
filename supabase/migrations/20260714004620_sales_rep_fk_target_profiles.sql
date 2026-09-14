-- ── point the new sales_rep_id FKs at profiles, not auth.users ────────────────
-- clients.sales_rep_id and estimates.sales_rep_id already reference profiles(id)
-- in the live schema. The columns just added on crm_jobs/crm_contracts/
-- crm_invoices referenced auth.users(id) instead — fix them to match so
-- PostgREST embedding (profiles!<fkey>(name)) works the same way everywhere.

alter table crm_jobs
  drop constraint crm_jobs_sales_rep_id_fkey,
  add constraint crm_jobs_sales_rep_id_fkey
    foreign key (sales_rep_id) references profiles(id) on delete set null;

alter table crm_contracts
  drop constraint crm_contracts_sales_rep_id_fkey,
  add constraint crm_contracts_sales_rep_id_fkey
    foreign key (sales_rep_id) references profiles(id) on delete set null;

alter table crm_invoices
  drop constraint crm_invoices_sales_rep_id_fkey,
  add constraint crm_invoices_sales_rep_id_fkey
    foreign key (sales_rep_id) references profiles(id) on delete set null;
