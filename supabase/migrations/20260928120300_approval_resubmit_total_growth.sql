-- =============================================================================
-- submit_for_approval: re-ask approvals when the total grew
--
-- 20260926180000 carries APPROVED steps over on resubmit (so a rejection at
-- step 2 doesn't make step 1 approve again). But nothing compared the total
-- being resubmitted with the total the approver actually saw — a $500
-- approval carried over to a $9,000 resubmit.
--
-- Fix:
--   * approval_requests.entity_total_cents records the entity total at the
--     moment each request row is created (= what its approver decides on;
--     entities are locked while pending_approval).
--   * On resubmit, previously APPROVED rows are archived (so their steps are
--     asked again) when the new total exceeds the total recorded on that row,
--     or when that total is unknown (rows created before this migration) and
--     the entity's approved_total_cents doesn't cover the new total either.
--   * Non-admins may not (re)submit a requisition/PO that is already
--     ordered / partially_fulfilled / completed / closed.
--
-- Body re-stated from the live PROD definition (2026-09-28) with only these
-- additions. Grants re-stated. Safe to apply before or after the code deploy
-- (no app change needed). Idempotent.
-- =============================================================================

ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS entity_total_cents integer;

CREATE OR REPLACE FUNCTION public.submit_for_approval(p_entity_type text, p_entity_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_org       uuid;
  v_role      text;
  v_total     integer;
  v_ent_org   uuid;
  v_ent_status text;
  v_approved_total integer;
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
    SELECT org_id, grand_total, status, approved_total_cents
      INTO v_ent_org, v_total, v_ent_status, v_approved_total
      FROM public.requisitions WHERE id = p_entity_id AND deleted_at IS NULL;
  ELSIF p_entity_type = 'purchase_order' THEN
    IF v_role = 'crew' THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501'; END IF;
    SELECT org_id, grand_total, status, approved_total_cents
      INTO v_ent_org, v_total, v_ent_status, v_approved_total
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

  -- Past the approval stage: re-opening approval would flip an ordered /
  -- received record back to pending. Admin-only.
  IF v_ent_status IN ('ordered', 'partially_fulfilled', 'completed', 'closed')
     AND v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'This % is already % — only an admin can resubmit it for approval',
      replace(p_entity_type, '_', ' '), replace(v_ent_status, '_', ' ')
      USING ERRCODE = '42501';
  END IF;

  PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'pending');

  SELECT id INTO v_flow_id FROM public.approval_flows
   WHERE org_id = v_org AND entity_type = p_entity_type AND deleted_at IS NULL
   LIMIT 1;

  DELETE FROM public.approval_requests
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('pending', 'superseded');
  UPDATE public.approval_requests SET archived = true
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('rejected', 'skipped');

  -- An approval only covers the total its approver saw. If the total grew
  -- past it, archive the approval so that step is asked again.
  UPDATE public.approval_requests SET archived = true
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status = 'approved'
     AND (
       (entity_total_cents IS NOT NULL AND v_total > entity_total_cents)
       OR (entity_total_cents IS NULL AND (v_approved_total IS NULL OR v_total > v_approved_total))
     );

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
      v_bypass := v_role = 'admin' AND v_step.required_role = 'manager';
      v_status := CASE WHEN NOT v_required OR v_bypass THEN 'skipped' ELSE 'pending' END;

      IF v_step.assigned_user_id IS NOT NULL THEN
        INSERT INTO public.approval_requests
          (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
        SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", v_step.assigned_user_id,
               coalesce((SELECT name FROM public.profiles WHERE id = v_step.assigned_user_id), 'Unknown'),
               v_step.required_role, v_status, v_total;
      ELSIF p_entity_type = 'crm_estimate' THEN
        WITH ins AS (
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", e.user_id,
                 e.first_name || ' ' || e.last_name, v_step.required_role, v_status, v_total
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
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", f.id, f.name,
                 v_step.required_role, v_status, v_total
            FROM fallback f
          RETURNING 1
        ) SELECT count(*) INTO v_pending FROM ins;
      END IF;

    END LOOP;
  END IF;

  SELECT count(*) INTO v_pending FROM public.approval_requests
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status = 'pending';

  IF v_pending = 0 THEN
    PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'approved');
    RETURN jsonb_build_object('auto_approved', true);
  END IF;

  RETURN jsonb_build_object('auto_approved', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_for_approval(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_for_approval(text, uuid) TO authenticated;
