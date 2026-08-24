-- Using or invoicing a tracked Product on a CRM Job should decrement
-- product_items.quantity_on_hand, with a reversible per-line status control
-- (mirrors Service Autopilot's Invoiced / Used-do-not-invoice / Not-used-cancel
-- model). Previously crm_job_products had no status at all and job invoicing
-- never included products — only crm_job_services flowed into an invoice.

ALTER TABLE public.crm_invoice_line_items
  ADD COLUMN product_id uuid REFERENCES public.product_items(id) ON DELETE SET NULL;

ALTER TABLE public.crm_job_products
  ADD COLUMN status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'used_no_invoice', 'not_used')),
  ADD COLUMN invoice_line_item_id uuid REFERENCES public.crm_invoice_line_items(id) ON DELETE SET NULL,
  -- Remembers exactly how much was deducted for this row so reopening/
  -- cancelling later restores the right amount even if qty is edited in
  -- between (qty edits are blocked once a row leaves 'pending', but this is
  -- the safety net).
  ADD COLUMN inventory_adjusted_qty numeric;

CREATE INDEX idx_job_products_invoice_line_item
  ON public.crm_job_products(invoice_line_item_id) WHERE invoice_line_item_id IS NOT NULL;

-- Generalized sibling of adjust_part_quantity() (20260806000002) for the
-- Landscapt product catalog — product_items.quantity_on_hand is numeric(10,2)
-- (20260807000005), distinct from CMMS parts.quantity_on_hand which stays
-- integer, so this can't just reuse that function.
CREATE OR REPLACE FUNCTION public.adjust_product_item_quantity(
  p_org_id     uuid,
  p_product_id uuid,
  p_delta      numeric,
  p_reason     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_user_name    text;
  v_old_qty      numeric;
  v_new_qty      numeric;
  v_product_name text;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL OR p_org_id != public.my_org_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_delta = 0 THEN
    RETURN;
  END IF;

  SELECT name INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id
    LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  SELECT quantity_on_hand, name INTO v_old_qty, v_product_name
    FROM public.product_items
    WHERE id = p_product_id AND org_id = p_org_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;
  v_new_qty := v_old_qty + p_delta;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Adjustment would make % quantity on hand negative (% + % = %)', v_product_name, v_old_qty, p_delta, v_new_qty;
  END IF;

  UPDATE public.product_items
  SET quantity_on_hand = v_new_qty
  WHERE id = p_product_id AND org_id = p_org_id;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    p_org_id, v_user_id, 'product_item', p_product_id, 'qty_adjusted',
    v_user_name,
    v_product_name || ': ' || COALESCE(p_reason, 'quantity adjustment') || ' '
      || (CASE WHEN p_delta > 0 THEN '+' ELSE '' END) || p_delta,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
END;
$$;

-- Flips a job product's usage/invoicing status, applying the matching
-- inventory delta exactly once per "used" transition (invoiced or
-- used_no_invoice both count as used) and reversing it if the row is later
-- reopened to pending or cancelled to not_used. Entering 'invoiced' is only
-- ever driven by the invoice-creation flow itself (which also links
-- invoice_line_item_id); this function only touches status + inventory.
CREATE OR REPLACE FUNCTION public.set_job_product_status(
  p_job_product_id uuid,
  p_new_status     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id       uuid;
  v_product_id   uuid;
  v_qty          numeric;
  v_old_status   text;
  v_restore      numeric;
  v_is_inventory boolean;
  v_old_used     boolean;
  v_new_used     boolean;
BEGIN
  IF p_new_status NOT IN ('pending', 'invoiced', 'used_no_invoice', 'not_used') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT org_id, product_id, qty, status, inventory_adjusted_qty
    INTO v_org_id, v_product_id, v_qty, v_old_status, v_restore
    FROM public.crm_job_products
    WHERE id = p_job_product_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job product not found';
  END IF;

  IF v_org_id != public.my_org_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_old_used := v_old_status IN ('invoiced', 'used_no_invoice');
  v_new_used := p_new_status IN ('invoiced', 'used_no_invoice');

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
$$;
