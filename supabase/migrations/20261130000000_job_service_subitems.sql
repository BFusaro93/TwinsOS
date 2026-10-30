-- What a crew needs to know about the sub-items under a job service: the
-- products to bring and the sub-services to do. Copied from the accepted
-- estimate when it converts to a job (estimate_line_item_subitems stays the
-- estimate's own priced record).
--
-- Deliberately NO money columns: the sub-item dollars are already folded into
-- the parent job service's price, so nothing here can bill, and a crew device
-- never receives a rate or cost. Not wired into crm_job_products, so it can't
-- double-bill or touch inventory.

CREATE TABLE IF NOT EXISTS public.crm_job_service_subitems (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL DEFAULT my_org_id() REFERENCES public.organizations(id),
  job_service_id    uuid NOT NULL REFERENCES public.crm_job_services(id) ON DELETE CASCADE,
  type              text NOT NULL DEFAULT 'product' CHECK (type IN ('product', 'subservice')),
  product_id        uuid,
  service_id        uuid,
  name              text NOT NULL,
  qty               numeric NOT NULL DEFAULT 1,
  sort_order        int NOT NULL DEFAULT 0,
  source_subitem_id uuid,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crm_job_service_subitems_job_service_idx
  ON public.crm_job_service_subitems (job_service_id);
CREATE UNIQUE INDEX IF NOT EXISTS crm_job_service_subitems_source_key
  ON public.crm_job_service_subitems (job_service_id, source_subitem_id)
  WHERE source_subitem_id IS NOT NULL;

ALTER TABLE public.crm_job_service_subitems ENABLE ROW LEVEL SECURITY;

-- Same shape as crm_job_services (20260910160000_crew_write_lockdown.sql):
-- office users manage, crew can only read.
DROP POLICY IF EXISTS "org members manage job service subitems" ON public.crm_job_service_subitems;
CREATE POLICY "org members manage job service subitems"
  ON public.crm_job_service_subitems FOR ALL
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
         AND coalesce(my_role(), '') <> 'crew')
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
              AND coalesce(my_role(), '') <> 'crew');

DROP POLICY IF EXISTS "crew reads job service subitems" ON public.crm_job_service_subitems;
CREATE POLICY "crew reads job service subitems"
  ON public.crm_job_service_subitems FOR SELECT
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "require_crm_access" ON public.crm_job_service_subitems;
CREATE POLICY "require_crm_access"
  ON public.crm_job_service_subitems AS RESTRICTIVE FOR ALL
  USING (public.has_crm_access()) WITH CHECK (public.has_crm_access());

-- Jobs already converted from an estimate: bring their sub-items across too.
INSERT INTO public.crm_job_service_subitems
  (org_id, job_service_id, type, product_id, service_id, name, qty, sort_order, source_subitem_id)
SELECT js.org_id, js.id, si.type, si.product_id, si.service_id, si.name, si.qty, si.sort_order, si.id
FROM public.crm_job_services js
JOIN public.estimate_line_item_subitems si ON si.line_item_id = js.estimate_line_item_id
WHERE si.deleted_at IS NULL
  AND js.estimate_line_item_id IS NOT NULL
ON CONFLICT DO NOTHING;

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
