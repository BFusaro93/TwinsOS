-- Reverting the previous migration's work_orders.crm_job_id link and the
-- "Create a Work Order?" toggle it powered — a CRM job doesn't map to a CMMS
-- asset, so the work order it created was an orphan record (no asset_id,
-- no linked_entity_type) sitting in the CMMS Work Orders list with nothing
-- to actually maintain. Decided to drop the feature rather than keep it.

alter table work_orders drop column if exists crm_job_id;
alter table crm_jobs drop column if exists create_work_order;
