-- useDeletePackageService did a real DELETE on crm_package_services (a
-- package's per-visit schedule rows), violating the project's soft-delete-
-- only convention (compare to useDeletePackage, which correctly soft-deletes
-- the parent crm_packages row). Add the missing deleted_at column so the
-- hook can be switched to a soft delete without losing the row entirely.
alter table public.crm_package_services
  add column if not exists deleted_at timestamptz;
