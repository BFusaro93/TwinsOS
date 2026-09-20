-- On TEST, crm_service_rate_matrix predates 20260629012636_sprint4_estimates_advanced.sql
-- with an old shape (from_qty/to_qty, no custom_field_id/calc_type/is_tail_row/deleted_at).
-- That migration's `CREATE TABLE IF NOT EXISTS` was a no-op there, so the table never
-- picked up the shape PROD has and the app code (use-rate-matrix.ts) expects. The table
-- is empty on TEST, so reconcile it directly rather than attempting a data migration.

alter table crm_service_rate_matrix
  add column if not exists custom_field_id uuid references crm_rate_matrix_field_defs(id),
  add column if not exists calc_type smallint not null default 1,
  add column if not exists from_val numeric not null default 0,
  add column if not exists to_val numeric,
  add column if not exists is_tail_row boolean not null default false,
  add column if not exists tail_every_qty numeric,
  add column if not exists tail_over_qty numeric,
  add column if not exists deleted_at timestamptz;

alter table crm_service_rate_matrix
  alter column custom_field_id set not null,
  drop column if exists from_qty,
  drop column if exists to_qty;
