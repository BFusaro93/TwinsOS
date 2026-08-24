-- Only project_material/stocked_material line items may carry a project_id
-- (CLAUDE.md) — maintenance_part spend belongs to CMMS, not a landscaping
-- job's cost rollup. This was purely UI-convention enforced (NewPODialog/
-- NewRequisitionDialog forced projectId to null for maintenance_part items,
-- but LineItemsTable's edit path and ProjectDetailPanel's add-to-existing-
-- PO/Requisition flow did not), so two separate app-code bugs let a
-- maintenance_part line item end up with a project_id anyway. Both are fixed
-- now, but nothing stopped a third path from reintroducing it — add a DB
-- trigger as the actual backstop.

CREATE OR REPLACE FUNCTION public.guard_line_item_project_category()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_maint_part boolean;
BEGIN
  -- Only re-validate when project_id is actually being set/changed — an
  -- unrelated field edit (quantity, unit cost) on a row from before this
  -- guard existed must not be blocked by a project_id it didn't just set.
  IF TG_OP = 'UPDATE' AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id THEN
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.part_id IS NOT NULL THEN
    v_is_maint_part := true;
  ELSIF NEW.product_item_id IS NOT NULL THEN
    SELECT (category = 'maintenance_part') INTO v_is_maint_part
    FROM public.product_items WHERE id = NEW.product_item_id;
  ELSE
    v_is_maint_part := false;
  END IF;

  IF v_is_maint_part IS TRUE THEN
    RAISE EXCEPTION 'A maintenance_part line item cannot be assigned to a project'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_po_line_item_project_category ON public.po_line_items;
CREATE TRIGGER trg_guard_po_line_item_project_category
  BEFORE INSERT OR UPDATE ON public.po_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_line_item_project_category();

DROP TRIGGER IF EXISTS trg_guard_requisition_line_item_project_category ON public.requisition_line_items;
CREATE TRIGGER trg_guard_requisition_line_item_project_category
  BEFORE INSERT OR UPDATE ON public.requisition_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_line_item_project_category();
