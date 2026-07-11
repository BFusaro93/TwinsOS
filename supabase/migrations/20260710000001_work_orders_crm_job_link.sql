-- The CRM "Create a Work Order?" toggle on job creation has always stored
-- crm_jobs.create_work_order but nothing ever consumed it, and there was no
-- column to link a work_orders row back to the CRM job that spawned it.
-- Add that link so the toggle can actually create a work order.

alter table work_orders
  add column if not exists crm_job_id uuid references crm_jobs(id) on delete set null;

create index if not exists work_orders_crm_job_id_idx on work_orders (crm_job_id) where crm_job_id is not null;
