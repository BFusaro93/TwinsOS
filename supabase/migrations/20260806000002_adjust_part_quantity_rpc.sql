-- receive_part_quantity() (20260710000001) only supports a positive p_quantity
-- (raises if <= 0), because it was written for the initial-receipt path only.
-- Editing an already-recorded Goods Receipt's line quantity has no equivalent
-- attributed adjustment path, so useUpdateGoodsReceipt (use-goods-receipts.ts)
-- never touched parts.quantity_on_hand at all when a receipt line was
-- corrected — inventory silently drifted from what the receipt claimed.
--
-- adjust_part_quantity() is the sibling for that case: same SECURITY DEFINER/
-- attributed-audit-entry shape as receive_part_quantity(), but takes a signed
-- delta (positive to correct upward, negative to correct downward) instead of
-- a receipt-quantity, and does not touch cost_layers/unit_cost — retroactively
-- re-deriving WAC cost history for a quantity correction is a separate,
-- higher-risk change and out of scope here.

CREATE OR REPLACE FUNCTION public.adjust_part_quantity(
  p_org_id     uuid,
  p_part_id    uuid,
  p_delta      integer,
  p_po_number  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_user_name text;
  v_old_qty   integer;
  v_new_qty   integer;
  v_part_name text;
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

  SELECT quantity_on_hand, name INTO v_old_qty, v_part_name
    FROM public.parts
    WHERE id = p_part_id AND org_id = p_org_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part not found';
  END IF;
  v_new_qty := v_old_qty + p_delta;

  IF v_new_qty < 0 THEN
    RAISE EXCEPTION 'Adjustment would make % quantity on hand negative (% + % = %)', v_part_name, v_old_qty, p_delta, v_new_qty;
  END IF;

  PERFORM set_config('app.suppress_parts_qty_audit', 'true', true);

  UPDATE public.parts
  SET quantity_on_hand = v_new_qty
  WHERE id = p_part_id AND org_id = p_org_id;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    p_org_id, v_user_id, 'part', p_part_id, 'received',
    v_user_name,
    v_part_name || ': receipt correction ' || (CASE WHEN p_delta > 0 THEN '+' ELSE '' END) || p_delta
      || ' via PO ' || COALESCE(NULLIF(p_po_number, ''), '(unknown)'),
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
END;
$$;
