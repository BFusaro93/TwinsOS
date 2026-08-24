-- Same gap as guard_estimate_approval_status() (20260805000000), for the other
-- two approval-gated entities: requisitions.status and purchase_orders.status
-- double as their own lifecycle status column (no separate approval_status),
-- but RLS on both tables is a plain `org_id = my_org_id()` FOR ALL policy —
-- any org member could set status = 'approved'/'rejected' directly via the
-- browser Supabase client, completely bypassing the approval_requests chain
-- (which does have order-enforced RLS via only_approver_can_update).
--
-- Guard it the same way: only 'approved'/'rejected' are gated (draft,
-- pending_approval, ordered, closed, canceled, completed, partially_fulfilled,
-- etc. all pass through freely, since those aren't approval outcomes), and
-- allow the transition only for an admin/manager actor or once the
-- approval_requests chain for that entity is fully resolved with a matching
-- outcome. One function parameterized by TG_TABLE_NAME since the two tables'
-- approval_requests.entity_type values ("requisition" / "purchase_order")
-- differ from their table names.

CREATE OR REPLACE FUNCTION public.guard_procurement_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  entity_type_val text;
  all_resolved boolean;
  any_rejected boolean;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  entity_type_val := CASE TG_TABLE_NAME
    WHEN 'requisitions' THEN 'requisition'
    WHEN 'purchase_orders' THEN 'purchase_order'
    ELSE TG_TABLE_NAME
  END;

  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  IF actor_role IN ('admin', 'manager') THEN
    RETURN NEW;
  END IF;

  SELECT
    bool_and(status IN ('approved', 'rejected', 'skipped', 'superseded')),
    bool_or(status = 'rejected')
  INTO all_resolved, any_rejected
  FROM public.approval_requests
  WHERE entity_type = entity_type_val AND entity_id = NEW.id;

  IF all_resolved IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot set % status to % — the approval chain for this record is not fully resolved', TG_TABLE_NAME, NEW.status
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.status = 'rejected') IS DISTINCT FROM (any_rejected IS TRUE) THEN
    RAISE EXCEPTION '% status % does not match the resolved approval chain outcome', TG_TABLE_NAME, NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_requisition_approval_status ON public.requisitions;
CREATE TRIGGER trg_guard_requisition_approval_status
  BEFORE UPDATE ON public.requisitions
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.guard_procurement_approval_status();

DROP TRIGGER IF EXISTS trg_guard_purchase_order_approval_status ON public.purchase_orders;
CREATE TRIGGER trg_guard_purchase_order_approval_status
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public.guard_procurement_approval_status();
