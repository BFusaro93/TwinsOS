-- CLAUDE.md documents "A Landscapt Job can spawn a Purchase Requisition
-- (Equipt/PO) when materials are needed (same pattern as Work Order ->
-- Requisition)" but requisitions only ever gained a work_order_id column
-- (20260325000000_initial_schema.sql) -- there was nowhere to record a
-- requisition spawned from a CRM job, so that half of the integration point
-- could only be tracked informally in free-text notes.
alter table requisitions add column if not exists crm_job_id uuid references crm_jobs(id);

create index if not exists idx_requisitions_crm_job_id on requisitions(crm_job_id)
  where crm_job_id is not null;
