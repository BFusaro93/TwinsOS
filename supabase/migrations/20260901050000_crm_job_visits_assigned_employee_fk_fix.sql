-- crm_job_visits.assigned_employee_id was originally added referencing
-- profiles(id) in 20260629012652_crew_app.sql, then a later migration
-- (20260824114246_dispatch_board_columns.sql) tried to repoint it to
-- crm_employees(id) via `add column if not exists ... references
-- crm_employees(id)` — but ADD COLUMN IF NOT EXISTS is a full no-op
-- (including the constraint clause) once the column already exists, so that
-- repoint never actually took effect. Live data already holds
-- crm_employees.id values (the app-level intent), so the FK was simply
-- unenforced this whole time rather than wrong — add it for real now,
-- following the same pattern as work_orders/crm_tickets/pm_schedules.
alter table crm_job_visits drop constraint if exists crm_job_visits_assigned_employee_id_fkey;

update crm_job_visits set assigned_employee_id = null
where assigned_employee_id is not null
  and not exists (select 1 from crm_employees ce where ce.id = crm_job_visits.assigned_employee_id);

alter table crm_job_visits
  add constraint crm_job_visits_assigned_employee_id_fkey
  foreign key (assigned_employee_id) references crm_employees(id) on delete set null;
