-- Estimate templates ("bundles") can contain whole packages.
--
-- A template item with package_id set is a package line: applying the template to an
-- estimate adds the package exactly like Add Package does (a section header named after
-- the package plus one priced line per package step, honoring the Rate Matrix and the
-- client's takeoff). Such an item carries no qty/rate of its own; service_name holds the
-- package name so the editor can list it, and the other columns keep their defaults.
--
-- Additive only: safe to apply before or after the code deploy. ON DELETE SET NULL keeps a
-- template usable if a package is hard-deleted (packages are normally soft-deleted, and a
-- soft-deleted package is skipped when the template is applied).

alter table public.estimate_template_items
  add column if not exists package_id uuid references public.crm_packages(id) on delete set null;

create index if not exists estimate_template_items_package_idx
  on public.estimate_template_items (package_id)
  where package_id is not null;

notify pgrst, 'reload schema';
