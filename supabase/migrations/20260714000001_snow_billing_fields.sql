-- Snow invoicing: per-inch rate field, asset type, and invoice-line traceability.
--
-- snow_days_authorized (added in 20260711000001_snow_dispatch.sql) turned out to
-- be dead — JobsList.tsx's "Days Authorized" picker for snow jobs already writes
-- to the generic `schedule_days` column, so the exclusion filter in the Snow
-- Dispatch Board's Add Jobs dialog is switched to read that instead. Drop the
-- unused column (zero rows reference it).
--
-- rate_per_inch_cents/asset_type let a snow job express per-inch billing without
-- building the (currently unused anywhere) generic rate-matrix system's first
-- real consumer.
--
-- crm_invoice_line_items.visit_id lets the Snow Invoicing page know which
-- visits have already been billed, since one snow job can have many visits
-- (one per storm) unlike most other job types.

ALTER TABLE public.crm_jobs
  ADD COLUMN IF NOT EXISTS rate_per_inch_cents integer,
  ADD COLUMN IF NOT EXISTS asset_type text,
  DROP COLUMN IF EXISTS snow_days_authorized;

ALTER TABLE public.crm_invoice_line_items
  ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES public.crm_job_visits(id);

CREATE INDEX IF NOT EXISTS idx_crm_invoice_line_items_visit_id
  ON public.crm_invoice_line_items (visit_id) WHERE visit_id IS NOT NULL;
