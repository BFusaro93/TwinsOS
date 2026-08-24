-- Receiving a PO line for a bulk material (e.g. 182.4 lbs of mulch) failed
-- with "invalid input syntax for type integer" because product_items.
-- quantity_on_hand was integer. po_line_items.quantity and goods_receipt_
-- lines.quantity_* already support decimals (20260421000000), but the
-- catalog on-hand count never got the same treatment.
--
-- parts.quantity_on_hand stays integer — CMMS parts are always discrete
-- physical units (per 20260421000000's original reasoning) — but
-- product_items covers stocked_material/project_material too, which are
-- legitimately measured in fractional lbs/gallons/tons. Widen the column
-- and add a guard so maintenance_part catalog rows (still discrete units)
-- can't be given a fractional on-hand count.

-- rpt_products depends on quantity_on_hand's type; drop and recreate around
-- the ALTER (identical definition, just re-created after the column widens).
DROP VIEW IF EXISTS public.rpt_products;

ALTER TABLE public.product_items
  ALTER COLUMN quantity_on_hand TYPE numeric(10, 2);

CREATE VIEW public.rpt_products AS
 SELECT id,
    name,
    part_number,
    category,
    part_category,
    unit_cost,
    price,
    vendor_name,
    is_inventory,
    quantity_on_hand,
    minimum_stock
   FROM product_items p
  WHERE deleted_at IS NULL;

GRANT ALL ON public.rpt_products TO postgres, authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.guard_maintenance_part_integer_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category = 'maintenance_part' AND NEW.quantity_on_hand <> trunc(NEW.quantity_on_hand) THEN
    RAISE EXCEPTION 'A maintenance_part catalog item cannot have a fractional quantity_on_hand (got %)', NEW.quantity_on_hand
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_maintenance_part_integer_quantity ON public.product_items;
CREATE TRIGGER trg_guard_maintenance_part_integer_quantity
  BEFORE INSERT OR UPDATE ON public.product_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_maintenance_part_integer_quantity();

-- Same guard for po_line_items / requisition_line_items / goods_receipt_lines:
-- their quantity columns are already numeric, but a maintenance_part line
-- (you don't order or receive 3.5 oil filters) should still be rejected if
-- given a fractional quantity.

CREATE OR REPLACE FUNCTION public.guard_line_item_maint_part_integer_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_maint_part boolean;
  v_qty numeric;
BEGIN
  IF TG_TABLE_NAME = 'goods_receipt_lines' THEN
    v_is_maint_part := NEW.is_maint_part;
    v_qty := NEW.quantity_received;
  ELSE
    v_qty := NEW.quantity;
    IF NEW.product_item_id IS NULL THEN
      v_is_maint_part := false;
    ELSE
      SELECT (category = 'maintenance_part') INTO v_is_maint_part
      FROM public.product_items WHERE id = NEW.product_item_id;
    END IF;
  END IF;

  IF v_is_maint_part IS TRUE AND v_qty <> trunc(v_qty) THEN
    RAISE EXCEPTION 'A maintenance_part line item cannot have a fractional quantity (got %)', v_qty
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_po_line_item_maint_qty ON public.po_line_items;
CREATE TRIGGER trg_guard_po_line_item_maint_qty
  BEFORE INSERT OR UPDATE ON public.po_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_line_item_maint_part_integer_quantity();

DROP TRIGGER IF EXISTS trg_guard_requisition_line_item_maint_qty ON public.requisition_line_items;
CREATE TRIGGER trg_guard_requisition_line_item_maint_qty
  BEFORE INSERT OR UPDATE ON public.requisition_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_line_item_maint_part_integer_quantity();

DROP TRIGGER IF EXISTS trg_guard_goods_receipt_line_maint_qty ON public.goods_receipt_lines;
CREATE TRIGGER trg_guard_goods_receipt_line_maint_qty
  BEFORE INSERT OR UPDATE ON public.goods_receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_line_item_maint_part_integer_quantity();
