-- Product sub-items on RECURRING and PACKAGE jobs, per visit.
--
-- A one-time job gets one pending crm_job_products row per product sub-item at
-- conversion (20261130000100). A recurring service repeats, and a job product is
-- recorded once and then final, so each VISIT gets its own row instead: the crew
-- records used / not used for today's visit, inventory drops that visit, and
-- Materials Needed counts the upcoming visits' rows.
--
-- visit_id is set ONLY on these rows; every other crm_job_products row stays
-- job-level (visit_id null), exactly as before.

ALTER TABLE public.crm_job_products
  ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES public.crm_job_visits(id);

CREATE UNIQUE INDEX IF NOT EXISTS crm_job_products_visit_subitem_key
  ON public.crm_job_products (visit_id, job_service_subitem_id)
  WHERE visit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS crm_job_products_visit_idx
  ON public.crm_job_products (visit_id) WHERE visit_id IS NOT NULL;

-- Every new visit of a recurring/package job copies its service's product
-- sub-items as pending, zero-price rows (never billed: the dollars are already in
-- the service price; the invoice sweeps skip job_service_subitem_id rows).
CREATE OR REPLACE FUNCTION public.crm_visit_subitem_product_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_type text;
BEGIN
  IF NEW.job_service_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT job_type INTO v_job_type FROM public.crm_jobs WHERE id = NEW.job_id;
  IF v_job_type IS NULL OR v_job_type NOT IN ('recurring', 'package') THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.crm_job_products
    (org_id, job_id, job_service_id, product_id, product_name, qty, unit_price_cents,
     status, job_service_subitem_id, visit_id)
  SELECT NEW.org_id, NEW.job_id, s.job_service_id, s.product_id, s.name, s.qty, 0,
         'pending', s.id, NEW.id
  FROM public.crm_job_service_subitems s
  WHERE s.job_service_id = NEW.job_service_id
    AND s.type = 'product'
    AND s.product_id IS NOT NULL
    AND s.deleted_at IS NULL
  ON CONFLICT (visit_id, job_service_subitem_id) WHERE visit_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_visit_subitem_product_rows() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_visit_subitem_product_rows ON public.crm_job_visits;
CREATE TRIGGER trg_visit_subitem_product_rows
  AFTER INSERT ON public.crm_job_visits
  FOR EACH ROW EXECUTE FUNCTION public.crm_visit_subitem_product_rows();

-- Visits that already exist (jobs converted before this): upcoming ones only.
INSERT INTO public.crm_job_products
  (org_id, job_id, job_service_id, product_id, product_name, qty, unit_price_cents,
   status, job_service_subitem_id, visit_id)
SELECT v.org_id, v.job_id, s.job_service_id, s.product_id, s.name, s.qty, 0,
       'pending', s.id, v.id
FROM public.crm_job_visits v
JOIN public.crm_jobs j ON j.id = v.job_id AND j.job_type IN ('recurring', 'package')
JOIN public.crm_job_service_subitems s ON s.job_service_id = v.job_service_id
WHERE v.deleted_at IS NULL
  AND v.status IN ('scheduled', 'dispatched', 'in_progress')
  AND s.type = 'product' AND s.product_id IS NOT NULL AND s.deleted_at IS NULL
ON CONFLICT (visit_id, job_service_subitem_id) WHERE visit_id IS NOT NULL DO NOTHING;
