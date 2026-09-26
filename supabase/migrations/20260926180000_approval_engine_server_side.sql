-- Move approval submission and decisions server-side.
--
-- The approval chain used to be computed and advanced entirely in the browser
-- (use-approval-requests.ts), with the DB only checking the end state. Holes
-- found in the 9/26 sweep:
--   * approval_requests INSERT/DELETE were open to every org member, so anyone
--     could delete the pending rows, insert an 'approved' one for themselves
--     and then approve their own PO/requisition/estimate.
--   * the status guards only looked at transitions INTO approved/rejected, so
--     a non-admin could go draft/requested -> ordered with no approval at all,
--     and POs/requisitions could be INSERTed already 'approved'.
--   * rejected rows from an earlier cycle stayed in the guard's
--     bool_or(status='rejected'), so a resubmitted record could never be
--     approved by a non-admin.
--   * non-admin approvers couldn't supersede other approvers' rows (RLS), so a
--     rejection or a multi-approver step left the record stuck.
--   * totals could be raised after approval without re-approval.
--
-- Now:
--   * submit_for_approval() / decide_approval() (SECURITY DEFINER) are the only
--     way non-admins change approval_requests or move a record into/out of
--     pending/approved/rejected. They set app.approval_rpc so the guards know.
--   * the guards whitelist the remaining manual transitions per table.
--   * approval_requests.archived hides rows from previous cycles.
--   * approved_total_cents records what was approved; a non-admin can't take a
--     record past 'approved' (or raise its total once ordered) above that.
-- Admins and managers keep their existing override (they bypass the guards),
-- matching the previous behavior.

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS approved_total_cents integer;
ALTER TABLE public.requisitions    ADD COLUMN IF NOT EXISTS approved_total_cents integer;

UPDATE public.purchase_orders SET approved_total_cents = grand_total
WHERE approved_total_cents IS NULL
  AND status IN ('approved', 'ordered', 'partially_fulfilled', 'completed');
UPDATE public.requisitions SET approved_total_cents = grand_total
WHERE approved_total_cents IS NULL AND status IN ('approved', 'ordered');

-- ── approval_requests: writes are RPC-only for non-admins ──────────────────
DROP POLICY IF EXISTS only_approver_can_update ON public.approval_requests;
DROP POLICY IF EXISTS approval_requests_admin_writes_update ON public.approval_requests;
DROP POLICY IF EXISTS approval_requests_admin_writes_insert ON public.approval_requests;
DROP POLICY IF EXISTS approval_requests_admin_writes_delete ON public.approval_requests;

CREATE POLICY approval_requests_admin_writes_update ON public.approval_requests
  AS RESTRICTIVE FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id = my_org_id()
                 AND p.role IN ('admin', 'manager') AND p.status = 'active'));
CREATE POLICY approval_requests_admin_writes_insert ON public.approval_requests
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id = my_org_id()
                      AND p.role IN ('admin', 'manager') AND p.status = 'active'));
CREATE POLICY approval_requests_admin_writes_delete ON public.approval_requests
  AS RESTRICTIVE FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.org_id = my_org_id()
                 AND p.role IN ('admin', 'manager') AND p.status = 'active'));

-- ── shared helpers ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._approval_actor_is_privileged()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT auth.role() = 'service_role'
      OR coalesce(current_setting('app.approval_rpc', true), '') = 'on'
      OR EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid() AND role IN ('admin', 'manager') AND status = 'active');
$$;
REVOKE ALL ON FUNCTION public._approval_actor_is_privileged() FROM PUBLIC, anon;

-- Sets the entity's approval status (and approved_total_cents on approval)
-- under the RPC flag so the guard triggers let it through.
CREATE OR REPLACE FUNCTION public._approval_set_entity_status(p_entity_type text, p_entity_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('app.approval_rpc', 'on', true);
  IF p_entity_type = 'requisition' THEN
    UPDATE public.requisitions
       SET status = CASE p_status WHEN 'pending' THEN 'pending_approval' ELSE p_status END,
           approved_total_cents = CASE WHEN p_status = 'approved' THEN grand_total ELSE approved_total_cents END
     WHERE id = p_entity_id;
  ELSIF p_entity_type = 'purchase_order' THEN
    UPDATE public.purchase_orders
       SET status = p_status,
           approved_total_cents = CASE WHEN p_status = 'approved' THEN grand_total ELSE approved_total_cents END
     WHERE id = p_entity_id;
  ELSIF p_entity_type = 'crm_estimate' THEN
    UPDATE public.estimates SET approval_status = p_status WHERE id = p_entity_id;
  ELSE
    RAISE EXCEPTION 'Unknown approval entity type %', p_entity_type;
  END IF;
  PERFORM set_config('app.approval_rpc', '', true);
END;
$$;
REVOKE ALL ON FUNCTION public._approval_set_entity_status(text, uuid, text) FROM PUBLIC, anon, authenticated;

-- ── submit_for_approval ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_for_approval(p_entity_type text, p_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_role      text;
  v_total     integer;
  v_ent_org   uuid;
  v_flow_id   uuid;
  v_step      record;
  v_required  boolean;
  v_bypass    boolean;
  v_status    text;
  v_pending   integer := 0;
  v_approved_steps uuid[];
BEGIN
  SELECT org_id, role INTO v_org, v_role
    FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_entity_type = 'requisition' THEN
    IF v_role = 'crew' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT org_id, grand_total INTO v_ent_org, v_total
      FROM public.requisitions WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'purchase_order' THEN
    IF v_role = 'crew' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT org_id, grand_total INTO v_ent_org, v_total
      FROM public.purchase_orders WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'crm_estimate' THEN
    IF NOT has_crm_access() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT org_id, total_cents INTO v_ent_org, v_total
      FROM public.estimates WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown approval entity type %', p_entity_type;
  END IF;

  IF v_ent_org IS NULL OR v_ent_org <> v_org THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'P0002';
  END IF;
  v_total := coalesce(v_total, 0);

  PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'pending');

  SELECT id INTO v_flow_id FROM public.approval_flows
   WHERE org_id = v_org AND entity_type = p_entity_type AND deleted_at IS NULL
   LIMIT 1;

  -- Close out the previous cycle: stale pending/superseded rows go, and
  -- rejected/skipped rows are archived (kept for audit, ignored from now on).
  -- Approved rows stay live — a step someone already signed off isn't re-asked.
  DELETE FROM public.approval_requests
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('pending', 'superseded');
  UPDATE public.approval_requests SET archived = true
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('rejected', 'skipped');

  IF v_flow_id IS NOT NULL THEN
    SELECT coalesce(array_agg(flow_step_id), '{}') INTO v_approved_steps
      FROM public.approval_requests
     WHERE entity_type = p_entity_type AND entity_id = p_entity_id
       AND NOT archived AND status = 'approved' AND flow_step_id IS NOT NULL;

    FOR v_step IN
      SELECT * FROM public.approval_flow_steps WHERE flow_id = v_flow_id ORDER BY "order"
    LOOP
      CONTINUE WHEN v_step.id = ANY (v_approved_steps);

      v_required := v_step.threshold_cents = 0 OR v_total >= v_step.threshold_cents;
      -- Admin submitters skip steps that need a role admins outrank.
      v_bypass := v_role = 'admin' AND v_step.required_role = 'manager';
      v_status := CASE WHEN NOT v_required OR v_bypass THEN 'skipped' ELSE 'pending' END;

      IF v_step.assigned_user_id IS NOT NULL THEN
        INSERT INTO public.approval_requests
          (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status)
        SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", v_step.assigned_user_id,
               coalesce((SELECT name FROM public.profiles WHERE id = v_step.assigned_user_id), 'Unknown'),
               v_step.required_role, v_status;
      ELSIF p_entity_type = 'crm_estimate' THEN
        WITH ins AS (
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status)
          SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", e.user_id,
                 e.first_name || ' ' || e.last_name, v_step.required_role, v_status
            FROM public.crm_employees e
           WHERE e.org_id = v_org AND e.deleted_at IS NULL AND e.user_id IS NOT NULL
             AND e.crm_role_id::text = v_step.required_role
          RETURNING 1
        ) SELECT count(*) INTO v_pending FROM ins;
      ELSE
        WITH targets AS (
          SELECT id, name FROM public.profiles
           WHERE org_id = v_org AND role = v_step.required_role AND status = 'active'
        ), fallback AS (
          SELECT id, name FROM targets
          UNION ALL
          (SELECT id, name FROM public.profiles
            WHERE org_id = v_org AND role = 'admin' AND status = 'active'
              AND NOT EXISTS (SELECT 1 FROM targets)
            ORDER BY created_at LIMIT 1)
        ), ins AS (
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status)
          SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", f.id, f.name,
                 v_step.required_role, v_status
            FROM fallback f
          RETURNING 1
        ) SELECT count(*) INTO v_pending FROM ins;
      END IF;

    END LOOP;
  END IF;

  -- Count rows, not steps: a step whose role nobody holds inserts nothing.
  SELECT count(*) INTO v_pending FROM public.approval_requests
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status = 'pending';

  -- Nobody left to approve (no flow, no steps, all satisfied or skipped).
  IF v_pending = 0 THEN
    PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'approved');
    RETURN jsonb_build_object('auto_approved', true);
  END IF;

  RETURN jsonb_build_object('auto_approved', false);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_for_approval(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_for_approval(text, uuid) TO authenticated;

-- ── decide_approval ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_approval(p_request_id uuid, p_status text, p_comment text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_role    text;
  v_req     public.approval_requests%ROWTYPE;
  v_ent_status text;
  v_unresolved integer;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision %', p_status;
  END IF;

  SELECT org_id, role INTO v_org, v_role
    FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Your account is no longer active, so you can''t act on this approval.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_req FROM public.approval_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR v_req.org_id <> v_org OR v_req.archived THEN
    RAISE EXCEPTION 'Approval request not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'This approval step has already been decided' USING ERRCODE = '42501';
  END IF;

  -- The record must still be awaiting approval (e.g. not reset to draft).
  SELECT CASE v_req.entity_type
           WHEN 'requisition'    THEN (SELECT status FROM public.requisitions WHERE id = v_req.entity_id)
           WHEN 'purchase_order' THEN (SELECT status FROM public.purchase_orders WHERE id = v_req.entity_id)
           WHEN 'crm_estimate'   THEN (SELECT approval_status FROM public.estimates WHERE id = v_req.entity_id)
         END INTO v_ent_status;
  IF v_ent_status IS DISTINCT FROM (CASE v_req.entity_type WHEN 'requisition' THEN 'pending_approval' ELSE 'pending' END) THEN
    RAISE EXCEPTION 'This record is no longer awaiting approval' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('admin', 'manager') THEN
    IF v_req.approver_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'You are not an approver on this step' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.approval_requests e
                WHERE e.entity_type = v_req.entity_type AND e.entity_id = v_req.entity_id
                  AND NOT e.archived AND e."order" < v_req."order" AND e.status = 'pending') THEN
      RAISE EXCEPTION 'It''s not your turn to approve this yet — an earlier step is still pending.' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.approval_requests
     SET status = p_status, comment = p_comment, decided_at = now()
   WHERE id = v_req.id;

  IF p_status = 'rejected' THEN
    -- A rejection anywhere halts the whole chain.
    UPDATE public.approval_requests SET status = 'superseded'
     WHERE entity_type = v_req.entity_type AND entity_id = v_req.entity_id
       AND NOT archived AND status = 'pending' AND id <> v_req.id;
    PERFORM public._approval_set_entity_status(v_req.entity_type, v_req.entity_id, 'rejected');
    RETURN jsonb_build_object('entity_type', v_req.entity_type, 'entity_id', v_req.entity_id, 'new_entity_status', 'rejected');
  END IF;

  -- Multi-approver step: first approval wins.
  IF v_req.flow_step_id IS NOT NULL THEN
    UPDATE public.approval_requests SET status = 'superseded'
     WHERE entity_type = v_req.entity_type AND entity_id = v_req.entity_id
       AND NOT archived AND status = 'pending' AND flow_step_id = v_req.flow_step_id AND id <> v_req.id;
  END IF;

  -- Resolved when every step group (orphans keyed by their own id) has an
  -- approval or is entirely skipped.
  SELECT count(*) INTO v_unresolved FROM (
    SELECT coalesce(flow_step_id::text, 'orphan-' || id::text) AS grp,
           bool_or(status = 'approved') AS any_approved,
           bool_and(status = 'skipped') AS all_skipped
      FROM public.approval_requests
     WHERE entity_type = v_req.entity_type AND entity_id = v_req.entity_id AND NOT archived
     GROUP BY 1
  ) g WHERE NOT (g.any_approved OR g.all_skipped);

  IF v_unresolved = 0 THEN
    PERFORM public._approval_set_entity_status(v_req.entity_type, v_req.entity_id, 'approved');
    RETURN jsonb_build_object('entity_type', v_req.entity_type, 'entity_id', v_req.entity_id, 'new_entity_status', 'approved');
  END IF;

  RETURN jsonb_build_object('entity_type', v_req.entity_type, 'entity_id', v_req.entity_id, 'new_entity_status', NULL);
END;
$$;
REVOKE ALL ON FUNCTION public.decide_approval(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_approval(uuid, text, text) TO authenticated;

-- ── status guards ──────────────────────────────────────────────────────────
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
  IF NEW.status IN ('ordered', 'partially_fulfilled', 'completed')
     AND NEW.approved_total_cents IS NOT NULL
     AND NEW.grand_total > NEW.approved_total_cents
  THEN
    RAISE EXCEPTION 'This % total now exceeds the approved amount — an admin or manager must make this change', TG_TABLE_NAME
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_purchase_order_approval_status ON public.purchase_orders;
CREATE TRIGGER trg_guard_purchase_order_approval_status
  BEFORE INSERT OR UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION guard_procurement_approval_status();

DROP TRIGGER IF EXISTS trg_guard_requisition_approval_status ON public.requisitions;
CREATE TRIGGER trg_guard_requisition_approval_status
  BEFORE INSERT OR UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION guard_procurement_approval_status();

CREATE OR REPLACE FUNCTION public.guard_estimate_approval_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.approval_status IS NOT DISTINCT FROM OLD.approval_status THEN
    RETURN NEW;
  END IF;
  IF public._approval_actor_is_privileged() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'approval_status can only change through the approval flow' USING ERRCODE = '42501';
END;
$$;
