-- CLAUDE.md requires "only the current approver in the chain can approve/
-- reject" to be enforced server-side. `approval_requests` rows already have
-- this via the `only_approver_can_update` RESTRICTIVE policy, but the
-- downstream write that actually flips `estimates.approval_status` to
-- 'approved'/'rejected' (made client-side by useDecideApproval, after the
-- approval_requests row updates succeed) was never itself protected — any
-- org member could set `estimates.approval_status = 'approved'` directly
-- via the browser Supabase client, completely bypassing the approval chain.
--
-- Guard it with a trigger (RLS alone can't compare OLD vs NEW column values):
-- freely allow the 'not_required'/'pending' transitions submitForApproval
-- writes, but require either an admin/manager actor or a fully-resolved,
-- outcome-matching approval_requests chain before allowing a transition to
-- 'approved'/'rejected'.

CREATE OR REPLACE FUNCTION public.guard_estimate_approval_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
  all_resolved boolean;
  any_rejected boolean;
BEGIN
  IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;

  -- Only 'approved'/'rejected' are gated — 'not_required'/'pending' are
  -- freely settable (submitForApproval writes these as part of the normal
  -- submit flow, before any approval_requests rows are resolved).
  IF NEW.approval_status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT role INTO actor_role FROM public.profiles WHERE id = auth.uid();
  IF actor_role IN ('admin', 'manager') THEN
    RETURN NEW;
  END IF;

  SELECT
    bool_and(status IN ('approved', 'rejected', 'skipped', 'superseded')),
    bool_or(status = 'rejected')
  INTO all_resolved, any_rejected
  FROM public.approval_requests
  WHERE entity_type = 'crm_estimate' AND entity_id = NEW.id;

  IF all_resolved IS NOT TRUE THEN
    RAISE EXCEPTION 'Cannot set approval_status to % — the approval chain for this estimate is not fully resolved', NEW.approval_status
      USING ERRCODE = '42501';
  END IF;

  IF (NEW.approval_status = 'rejected') IS DISTINCT FROM (any_rejected IS TRUE) THEN
    RAISE EXCEPTION 'approval_status % does not match the resolved approval chain outcome for this estimate', NEW.approval_status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_estimate_approval_status ON public.estimates;
CREATE TRIGGER trg_guard_estimate_approval_status
  BEFORE UPDATE ON public.estimates
  FOR EACH ROW
  WHEN (NEW.approval_status IS DISTINCT FROM OLD.approval_status)
  EXECUTE FUNCTION public.guard_estimate_approval_status();
