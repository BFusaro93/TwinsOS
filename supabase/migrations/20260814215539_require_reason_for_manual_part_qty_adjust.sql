-- Manual quantity adjustments on a Part (the QtyAdjustControl stepper on
-- PartDetailSheet) previously went through a plain `.update()` on
-- `parts.quantity_on_hand`, landing in fn_audit_log()'s generic, reason-less
-- "qty X -> Y" branch. That branch has no way to record *why* someone
-- changed the count, which made two separate double-counting bugs
-- (2026-07-14 and 2026-07-24 sessions) much harder to diagnose after the
-- fact. This RPC requires a reason and folds it into the same attributed,
-- colored audit row style already used by adjust_part_quantity() (WO) and
-- receive_part_quantity() (PO) — mirrors adjust_product_item_quantity()
-- (20260808000000), which already does this for the Products catalog.

CREATE OR REPLACE FUNCTION public.adjust_part_quantity_manual(
  p_part_id uuid,
  p_new_qty integer,
  p_reason  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id   uuid;
  v_user_name text;
  v_org_id    uuid;
  v_old_qty   integer;
  v_part_name text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF trim(coalesce(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'A reason is required for manual quantity adjustments';
  END IF;

  IF p_new_qty < 0 THEN
    RAISE EXCEPTION 'Quantity on hand cannot be negative';
  END IF;

  SELECT quantity_on_hand, name, org_id INTO v_old_qty, v_part_name, v_org_id
    FROM public.parts
    WHERE id = p_part_id AND deleted_at IS NULL
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Part not found';
  END IF;

  IF v_org_id != public.my_org_id() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_new_qty = v_old_qty THEN
    RETURN;
  END IF;

  SELECT coalesce(name, email, id::text) INTO v_user_name
    FROM public.profiles
    WHERE id = v_user_id
    LIMIT 1;
  v_user_name := COALESCE(v_user_name, 'System');

  PERFORM set_config('app.suppress_parts_qty_audit', 'true', true);

  UPDATE public.parts
  SET quantity_on_hand = p_new_qty,
      updated_at = now()
  WHERE id = p_part_id;

  INSERT INTO public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) VALUES (
    v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
    v_user_name,
    v_part_name || ': quantity adjusted — ' || trim(p_reason),
    'quantity_on_hand', v_old_qty::text, p_new_qty::text
  );
END;
$function$;
