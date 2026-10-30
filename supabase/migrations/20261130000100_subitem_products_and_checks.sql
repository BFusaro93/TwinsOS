-- Follow-up to 20261130000000 (job service sub-items): product sub-items as
-- non-billable job products, and the crew's per-visit tick-off for sub-services.

-- ── Product sub-items become (non-billable) job products ─────────────────────
-- A product under a one-time/project service is materialised as a pending
-- crm_job_products row at unit price 0, so it shows in Materials Needed, in the
-- crew's "Materials called for" (Used / Not used) and depletes inventory like any
-- other planned material. This column marks those rows so every invoice sweep can
-- leave them out: the sub-item dollars are already inside the parent service's
-- price, and a $0 line would only clutter the invoice.
ALTER TABLE public.crm_job_products
  ADD COLUMN IF NOT EXISTS job_service_subitem_id uuid REFERENCES public.crm_job_service_subitems(id);

CREATE INDEX IF NOT EXISTS crm_job_products_job_service_subitem_idx
  ON public.crm_job_products (job_service_subitem_id) WHERE job_service_subitem_id IS NOT NULL;

-- ── Crew tick-off, per visit ────────────────────────────────────────────────
-- A sub-service ("Labor - Hourly", "Install edging") is a task: the crew ticks it
-- off on the visit. Per visit because a recurring service repeats the same tasks.
CREATE TABLE IF NOT EXISTS public.crm_visit_subitem_checks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT my_org_id() REFERENCES public.organizations(id),
  visit_id    uuid NOT NULL REFERENCES public.crm_job_visits(id) ON DELETE CASCADE,
  subitem_id  uuid NOT NULL REFERENCES public.crm_job_service_subitems(id) ON DELETE CASCADE,
  checked_at  timestamptz NOT NULL DEFAULT now(),
  checked_by  uuid,
  UNIQUE (visit_id, subitem_id)
);

CREATE INDEX IF NOT EXISTS crm_visit_subitem_checks_visit_idx
  ON public.crm_visit_subitem_checks (visit_id);

ALTER TABLE public.crm_visit_subitem_checks ENABLE ROW LEVEL SECURITY;

-- Crew write through the API route (service role after an ownership check), so
-- RLS only has to let office users manage and everyone in the org read.
DROP POLICY IF EXISTS "org members manage visit subitem checks" ON public.crm_visit_subitem_checks;
CREATE POLICY "org members manage visit subitem checks"
  ON public.crm_visit_subitem_checks FOR ALL
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
         AND coalesce(my_role(), '') <> 'crew')
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
              AND coalesce(my_role(), '') <> 'crew');

DROP POLICY IF EXISTS "crew reads visit subitem checks" ON public.crm_visit_subitem_checks;
CREATE POLICY "crew reads visit subitem checks"
  ON public.crm_visit_subitem_checks FOR SELECT
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "require_crm_access" ON public.crm_visit_subitem_checks;
CREATE POLICY "require_crm_access"
  ON public.crm_visit_subitem_checks AS RESTRICTIVE FOR ALL
  USING (public.has_crm_access()) WITH CHECK (public.has_crm_access());
