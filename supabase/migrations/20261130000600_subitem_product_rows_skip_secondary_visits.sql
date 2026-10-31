-- A second crew added to a stop (crm_add_visit_crew) clones the lead visit with
-- crew_group_secondary = true. The per-visit sub-item product trigger copied every
-- product row onto that clone too, so the stop's materials were demanded — and could
-- be marked used, depleting inventory — twice. Secondary visits share the lead's rows.

CREATE OR REPLACE FUNCTION public.crm_visit_subitem_product_rows()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_type text;
BEGIN
  IF NEW.job_service_id IS NULL OR COALESCE(NEW.crew_group_secondary, false) THEN
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

-- Existing duplicates: pending rows that hang off a secondary visit.
UPDATE public.crm_job_products p
   SET deleted_at = now()
  FROM public.crm_job_visits v
 WHERE p.visit_id = v.id
   AND v.crew_group_secondary
   AND p.status = 'pending'
   AND p.deleted_at IS NULL;
