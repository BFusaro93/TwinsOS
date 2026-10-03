-- Let non-admins complete receiving after an admin raised the PO total.
CREATE OR REPLACE FUNCTION public.guard_procurement_approval_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF public._approval_actor_is_privileged() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF (TG_TABLE_NAME = 'purchase_orders' AND NEW.status IS DISTINCT FROM 'requested')
       OR (TG_TABLE_NAME = 'requisitions' AND NEW.status IS DISTINCT FROM 'draft') THEN
      RAISE EXCEPTION 'New % must start in draft and go through approval', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    NEW.approved_total_cents := NULL;
    RETURN NEW;
  END IF;

  -- approved_total_cents is only ever written by the approval RPCs.
  NEW.approved_total_cents := OLD.approved_total_cents;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF TG_TABLE_NAME = 'purchase_orders' THEN
      v_ok := CASE NEW.status
        WHEN 'requested'           THEN OLD.status IN ('pending', 'rejected', 'canceled')
        WHEN 'ordered'             THEN OLD.status = 'approved'
        WHEN 'partially_fulfilled' THEN OLD.status IN ('approved', 'ordered', 'completed')
        WHEN 'completed'           THEN OLD.status IN ('approved', 'ordered', 'partially_fulfilled')
        WHEN 'canceled'            THEN true
        ELSE false  -- pending / approved / rejected: approval RPCs only
      END;
    ELSE
      v_ok := CASE NEW.status
        WHEN 'draft'   THEN OLD.status IN ('pending_approval', 'rejected')
        WHEN 'ordered' THEN OLD.status = 'approved'
        WHEN 'closed'  THEN true
        ELSE false
      END;
    END IF;
    IF NOT v_ok THEN
      RAISE EXCEPTION 'Cannot move % from % to % — use the approval flow', TG_TABLE_NAME, OLD.status, NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Past approval, the total can't grow beyond what was approved.
  -- (While still 'approved' the app re-submits on any total change instead.)
  -- A pure receiving transition (ordered -> partially_fulfilled/completed,
  -- partially_fulfilled -> completed) that does not itself grow the total is
  -- exempt: an admin may have legitimately raised grand_total after approval
  -- (admin edits never refresh approved_total_cents), and a purchaser
  -- receiving goods must not be blocked by that.
  IF NEW.status IN ('ordered', 'partially_fulfilled', 'completed')
     AND NEW.approved_total_cents IS NOT NULL
     AND NEW.grand_total > NEW.approved_total_cents
     AND NOT (
       TG_TABLE_NAME = 'purchase_orders'
       AND NEW.status IS DISTINCT FROM OLD.status
       AND NEW.grand_total <= OLD.grand_total
       AND (
         (OLD.status = 'ordered' AND NEW.status IN ('partially_fulfilled', 'completed'))
         OR (OLD.status = 'partially_fulfilled' AND NEW.status = 'completed')
       )
     )
  THEN
    RAISE EXCEPTION 'This % total now exceeds the approved amount — an admin or manager must make this change', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
