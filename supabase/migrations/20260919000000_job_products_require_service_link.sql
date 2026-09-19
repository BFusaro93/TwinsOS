-- Products on a Job must belong to a specific Service (mirrors Estimates,
-- where a product is always attached to a service line, not floating on its
-- own). Kept nullable in the database — enforced as required by the app
-- layer (Zod + the Add Product form) instead of a NOT NULL constraint, so
-- existing rows created before this feature don't need a backfill guess.
--
-- ON DELETE RESTRICT: a service with products already linked to it can't be
-- removed out from under them. crm_job_services rows are hard-deleted (see
-- useDeleteJobService), so CASCADE here would silently discard job products —
-- including ones already invoiced/inventory-adjusted, skipping the restore
-- logic delete_job_product() applies. Forcing the product to be removed or
-- reassigned first is the safe default.
alter table public.crm_job_products
  add column if not exists job_service_id uuid references public.crm_job_services(id) on delete restrict;

create index if not exists idx_crm_job_products_job_service_id
  on public.crm_job_products(job_service_id)
  where deleted_at is null;
