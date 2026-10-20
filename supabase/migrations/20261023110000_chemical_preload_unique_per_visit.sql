-- Dispatch preload checks for existing application rows and then inserts, which
-- is not atomic: two concurrent preloads (double-click dispatch, bulk dispatch,
-- office + crew opening the card together) inserted the same product twice, and
-- each row deducts inventory at completion and lands in the compliance report.
-- Mark preloaded rows and make (visit, product) unique among the live ones.
-- Rows crew add by hand are unmarked, so a deliberate second application of the
-- same product on one visit is still allowed.
alter table public.crm_chemical_applications
  add column if not exists preloaded boolean not null default false;

create unique index if not exists crm_chemical_applications_preloaded_visit_product_uniq
  on public.crm_chemical_applications (visit_id, product_id)
  where preloaded and deleted_at is null;
