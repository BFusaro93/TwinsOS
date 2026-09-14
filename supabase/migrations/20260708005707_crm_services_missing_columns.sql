-- crm_services on production was missing ~20 columns that ServiceDialog's
-- save payload actually sends (rate matrix fields, job costing defaults,
-- snow/estimate flags, sub-service linkage, etc.) — meaning any service
-- create/update has been failing outright there, not just the category
-- mismatch fixed earlier today. Bring production's shape in line with what's
-- already deployed and working on the test project.
--
-- Also drops crm_services_unit_check, which only allowed
-- ('visit','sqft','hour','lb','yard') while ServiceDialog's UNITS list offers
-- ('visit','sqft','lf','cuyd','acres','hr','each','lb','gal') — the same
-- mismatch pattern as the category CHECK constraint fixed earlier, just
-- never surfaced because most saves were already failing on the missing
-- columns first.

alter table crm_services
  add column if not exists call_script_notes text,
  add column if not exists default_b_cost_cents integer not null default 0,
  add column if not exists default_b_hrs numeric not null default 0,
  add column if not exists description_on_estimate text,
  add column if not exists invoice_description text,
  add column if not exists matrix_tail_cost_cents integer,
  add column if not exists matrix_tail_every_qty numeric,
  add column if not exists matrix_tail_hours numeric,
  add column if not exists matrix_tail_over_qty numeric,
  add column if not exists matrix_tail_rate_cents integer,
  add column if not exists only_for_estimates boolean not null default false,
  add column if not exists parent_service_id uuid references crm_services(id) on delete set null,
  add column if not exists rate_matrix_calc text default 'qty_x_rate_x_visits',
  add column if not exists rate_matrix_field text,
  add column if not exists service_mode text not null default 'flat_rate' check (service_mode in ('flat_rate','hourly','per_unit')),
  add column if not exists show_in_snow_dispatch boolean not null default false,
  add column if not exists target_rate_cents integer not null default 0,
  add column if not exists target_rate_with_drive_cents integer not null default 0,
  add column if not exists task_color text default '#3B82F6',
  add column if not exists track_chemicals boolean not null default false;

alter table crm_services drop constraint if exists crm_services_unit_check;
