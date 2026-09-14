-- useDeleteCRMJobProduct previously soft-deleted crm_job_products directly, which
-- skipped the inventory restore that set_job_product_status() applies when leaving
-- a "used" status. Deleting a used/invoiced product left quantity_on_hand
-- permanently short. Route deletes through this function so the same restore
-- logic always runs first.
CREATE OR REPLACE FUNCTION public.delete_job_product(p_job_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id     uuid;
  v_product_id uuid;
  v_status     text;
  v_restore    numeric;
BEGIN
  SELECT org_id, product_id, status, inventory_adjusted_qty
    INTO v_org_id, v_product_id, v_status, v_restore
    FROM public.crm_job_products
    WHERE id = p_job_product_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job product not found';
  END IF;

  IF v_org_id != public.my_org_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status IN ('invoiced', 'used_no_invoice')
     AND v_restore IS NOT NULL AND v_restore != 0
     AND v_product_id IS NOT NULL THEN
    PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, v_restore, 'job product deleted');
  END IF;

  UPDATE public.crm_job_products
  SET deleted_at = now(), inventory_adjusted_qty = NULL
  WHERE id = p_job_product_id;
END;
$function$;
