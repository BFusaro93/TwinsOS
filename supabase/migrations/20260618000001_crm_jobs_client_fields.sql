-- CRM Jobs: add client-facing SA-style fields to crm_jobs and crm_job_services
-- These columns power the Jobs tab on the Client Detail Panel (Sprint 2)

alter table crm_jobs
  add column if not exists contract_id        uuid, -- FK to crm_contracts added when that table is created
  add column if not exists schedule           text,
  add column if not exists schedule_days      text[] default '{}',
  add column if not exists package_name       text,
  add column if not exists package_renewal    text,
  add column if not exists package_discount   text,
  add column if not exists conflict_days      text[] default '{}',
  add column if not exists inch_trigger       numeric,
  add column if not exists invoice_type       text,
  add column if not exists sales_rep          text,
  add column if not exists source             text,
  add column if not exists payment_type       text,
  add column if not exists po_number          text,
  add column if not exists date_sold          date,
  add column if not exists when_to_invoice    text,
  add column if not exists invoice_separately boolean default false,
  add column if not exists call_ahead         boolean default false,
  add column if not exists arrival_window_hours numeric,
  add column if not exists start_date_window  date,
  add column if not exists end_date_window    date,
  add column if not exists create_work_order  boolean default false,
  add column if not exists is_complete        boolean default false,
  add column if not exists service_total_cents integer not null default 0,
  add column if not exists product_total_cents integer not null default 0,
  add column if not exists tax_cents          integer not null default 0,
  add column if not exists total_cents        integer not null default 0,
  add column if not exists notes              text;

-- crm_job_services: add SA-style scheduling columns
alter table crm_job_services
  add column if not exists start_date         date,
  add column if not exists complete_by_date   date,
  add column if not exists start_recurring    date,
  add column if not exists assigned_to        text,
  add column if not exists budgeted_hours     numeric not null default 0,
  add column if not exists team_size          integer not null default 1,
  add column if not exists days_count         integer not null default 1,
  add column if not exists time_start         text,
  add column if not exists time_end           text,
  add column if not exists included           boolean not null default true,
  add column if not exists sort_order         integer not null default 0;

create index if not exists crm_jobs_org_client_created
  on crm_jobs (org_id, client_id, created_at desc);

create index if not exists crm_jobs_org_type_status
  on crm_jobs (org_id, job_type, status);
