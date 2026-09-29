-- Managers could override admins in the approval chain:
--   * decide_approval let admin OR manager decide any pending step, including
--     the "Admin Approval" step, so a manager could fully approve a PO that
--     needed an admin;
--   * the status guards exempted admins AND managers (via
--     _approval_actor_is_privileged), so a manager could set any PO or
--     requisition to approved/ordered directly, skipping the chain entirely;
--   * approval_requests rows were directly writable by managers.
-- Now only admins bypass. Managers can still stand in for another approver on
-- a non-admin step (e.g. a manager out sick), in chain order.
-- Function bodies are the live PROD definitions with only these lines changed.

CREATE OR REPLACE FUNCTION public._approval_actor_is_privileged()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.role() = 'service_role'
      OR coalesce(current_setting('app.approval_rpc', true), '') = 'on'
      OR EXISTS (SELECT 1 FROM public.profiles
                 WHERE id = auth.uid() AND role = 'admin' AND status = 'active');
$function$;

CREATE OR REPLACE FUNCTION public.decide_approval(p_request_id uuid, p_status text, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT CASE v_req.entity_type
           WHEN 'requisition'    THEN (SELECT status FROM public.requisitions WHERE id = v_req.entity_id)
           WHEN 'purchase_order' THEN (SELECT status FROM public.purchase_orders WHERE id = v_req.entity_id)
           WHEN 'crm_estimate'   THEN (SELECT approval_status FROM public.estimates WHERE id = v_req.entity_id)
         END INTO v_ent_status;
  IF v_ent_status IS DISTINCT FROM (CASE v_req.entity_type WHEN 'requisition' THEN 'pending_approval' ELSE 'pending' END) THEN
    RAISE EXCEPTION 'This record is no longer awaiting approval' USING ERRCODE = '42501';
  END IF;

  -- Admins may decide any step. Managers may stand in for another approver,
  -- but never on a step that requires an admin, and they follow chain order
  -- like everyone else. (Before 20260929100000 managers could approve the
  -- Admin Approval step themselves.)
  IF v_role IS DISTINCT FROM 'admin' THEN
    IF v_req.approver_id IS DISTINCT FROM v_uid
       AND (v_role IS DISTINCT FROM 'manager' OR v_req.approver_role = 'admin') THEN
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
    UPDATE public.approval_requests SET status = 'superseded'
     WHERE entity_type = v_req.entity_type AND entity_id = v_req.entity_id
       AND NOT archived AND status = 'pending' AND id <> v_req.id;
    PERFORM public._approval_set_entity_status(v_req.entity_type, v_req.entity_id, 'rejected');
    RETURN jsonb_build_object('entity_type', v_req.entity_type, 'entity_id', v_req.entity_id, 'new_entity_status', 'rejected');
  END IF;

  IF v_req.flow_step_id IS NOT NULL THEN
    UPDATE public.approval_requests SET status = 'superseded'
     WHERE entity_type = v_req.entity_type AND entity_id = v_req.entity_id
       AND NOT archived AND status = 'pending' AND flow_step_id = v_req.flow_step_id AND id <> v_req.id;
  END IF;

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
$function$;

-- approval_requests: direct writes are admin-only (the RPCs are SECURITY
-- DEFINER and unaffected; the approval-flow editor, which re-links rows when
-- steps are removed, is admin-only already).
drop policy if exists approval_requests_admin_writes_update on public.approval_requests;
drop policy if exists approval_requests_admin_writes_insert on public.approval_requests;
drop policy if exists approval_requests_admin_writes_delete on public.approval_requests;
create policy approval_requests_admin_writes_update on public.approval_requests as restrictive for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin' and p.status = 'active'));
create policy approval_requests_admin_writes_insert on public.approval_requests as restrictive for insert
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin' and p.status = 'active'));
create policy approval_requests_admin_writes_delete on public.approval_requests as restrictive for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.org_id = my_org_id() and p.role = 'admin' and p.status = 'active'));
