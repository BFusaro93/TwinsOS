-- ── reconcile estimates.sales_rep_id FK target across environments ────────────
-- On the test project, estimates_sales_rep_id_fkey already pointed to
-- profiles(id) (fixed at some earlier point, out of sync with prod). On prod
-- it still referenced auth.users(id) directly. Repointing it to profiles(id)
-- here makes every sales_rep_id FK in the app (clients, estimates, crm_jobs,
-- crm_contracts, crm_invoices) consistently reference profiles — no data
-- changes, since profiles.id is itself 1:1 with auth.users.id.
alter table estimates
  drop constraint if exists estimates_sales_rep_id_fkey,
  add constraint estimates_sales_rep_id_fkey
    foreign key (sales_rep_id) references profiles(id) on delete set null;
