-- set_job_product_status: crew may only move a PENDING material to
-- used / used_no_invoice / not_used.
--
-- Restated from its latest definition
-- (20260928100000_null_org_guards_and_member_write_policies.sql) with every
-- existing guard kept verbatim — status whitelist, FOR UPDATE row lock,
-- _org_mismatch() org check (NULL my_org_id() for service-role callers still
-- passes, by design), the crew effective-crew ownership check, and the
-- inventory decrement/restore logic. The only addition is the crew
-- transition check inside the existing crew branch; office roles and the
-- service role are unaffected.
--
-- CREATE OR REPLACE keeps the existing grants (revoked from public/anon,
-- granted to authenticated/service_role in 20260918120000); re-stated below
-- anyway so this file is safe on its own.

CREATE OR REPLACE FUNCTION public.set_job_product_status(p_job_product_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id       uuid;
  v_job_id       uuid;
  v_product_id   uuid;
  v_qty          numeric;
  v_old_status   text;
  v_restore      numeric;
  v_is_inventory boolean;
  v_old_used     boolean;
  v_new_used     boolean;
BEGIN
  IF p_new_status NOT IN ('pending', 'used', 'invoiced', 'used_no_invoice', 'not_used') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT org_id, job_id, product_id, qty, status, inventory_adjusted_qty
    INTO v_org_id, v_job_id, v_product_id, v_qty, v_old_status, v_restore
    FROM public.crm_job_products
    WHERE id = p_job_product_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job product not found';
  END IF;

  -- Unchanged from the original: a NULL my_org_id() (service role, which has no
  -- profile row) deliberately passes, because server-side flows such as goods
  -- receiving call this without an end-user session.
  IF public._org_mismatch(v_org_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Crew accounts: only their own crew's jobs. crm_job_products was missed by
  -- 20260910160000_crew_write_lockdown.sql and this function is SECURITY
  -- DEFINER, so without this a crew JWT could resolve materials on any job in
  -- the org. visit.crew_id is frequently NULL, so the job's crew is the
  -- fallback (the app calls this the effective crew).
  IF coalesce(public.my_role(), '') = 'crew' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.crm_job_visits v
      JOIN public.crm_jobs j ON j.id = v.job_id
      WHERE v.job_id = v_job_id
        AND v.deleted_at IS NULL
        AND coalesce(v.crew_id, j.crew_id) IN (SELECT public.my_crew_ids())
    ) THEN
      RAISE EXCEPTION 'Unauthorized';
    END IF;

    -- ...and only the field transitions. A crew records what happened to a
    -- still-pending material (used / used, don't bill / not used) and that's
    -- final for them — the crew route already 409s anything else, but this
    -- function is callable directly with a crew JWT, which could otherwise
    -- mark rows invoiced, reopen them to pending (restoring inventory), or
    -- flip used <-> not_used to churn stock.
    IF v_old_status IS DISTINCT FROM 'pending'
       OR p_new_status NOT IN ('used', 'used_no_invoice', 'not_used') THEN
      RAISE EXCEPTION 'Crew can only resolve a pending material (used, used_no_invoice or not_used)';
    END IF;
  END IF;

  -- 'used' means used-and-still-to-be-invoiced. It counts as a used state for
  -- inventory, so pending -> used decrements exactly once and used -> invoiced
  -- moves between two used states and does nothing.
  v_old_used := v_old_status IN ('used', 'invoiced', 'used_no_invoice');
  v_new_used := p_new_status IN ('used', 'invoiced', 'used_no_invoice');

  IF v_product_id IS NOT NULL THEN
    SELECT is_inventory INTO v_is_inventory FROM public.product_items WHERE id = v_product_id;
  END IF;

  IF NOT v_old_used AND v_new_used AND COALESCE(v_is_inventory, false) THEN
    PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, -v_qty, 'used on job');
    UPDATE public.crm_job_products
    SET status = p_new_status, inventory_adjusted_qty = v_qty
    WHERE id = p_job_product_id;
  ELSIF v_old_used AND NOT v_new_used THEN
    IF v_restore IS NOT NULL AND v_restore != 0 AND v_product_id IS NOT NULL THEN
      PERFORM public.adjust_product_item_quantity(v_org_id, v_product_id, v_restore, 'job product reopened or cancelled');
    END IF;
    UPDATE public.crm_job_products
    SET status = p_new_status, inventory_adjusted_qty = NULL
    WHERE id = p_job_product_id;
  ELSE
    UPDATE public.crm_job_products
    SET status = p_new_status
    WHERE id = p_job_product_id;
  END IF;
END;
$function$;


revoke execute on function public.set_job_product_status(uuid, text) from public, anon;
grant execute on function public.set_job_product_status(uuid, text) to authenticated, service_role;
