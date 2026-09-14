-- crm_crew_members was created by 20260617000003_crm_jobs.sql with a plain-text
-- `name`/`role` schema. A later migration (20260618000007_crm_employees.sql) tried
-- to redefine it with an `employee_id` FK + `is_foreman` via `create table if not
-- exists`, which is a silent no-op once the table already exists — so those columns
-- never actually landed, even though every current mutation hook (use-employees.ts)
-- reads/writes them. This backfills the missing columns without touching existing
-- name-based rows.
alter table crm_crew_members
  add column if not exists employee_id uuid references crm_employees(id) on delete cascade,
  add column if not exists is_foreman  boolean not null default false;

create unique index if not exists crm_crew_members_crew_employee_key
  on crm_crew_members (crew_id, employee_id)
  where employee_id is not null;
