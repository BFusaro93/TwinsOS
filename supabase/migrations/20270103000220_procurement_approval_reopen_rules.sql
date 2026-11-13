-- Round 13 / purchasing: approval re-open rules (owner decisions D2, D3, D4)
-- and the mid-chain total growth check (F3, F4).
--
--  D2  ANY line or vendor change after approval re-opens approval, not only a
--      higher total. Each approval now records what its approver saw:
--      approval_requests.content_hash (vendor + every line's product, part,
--      quantity, unit cost, taxable flag and project) and entity_total_cents
--      (the total at the moment of the decision). On (re)submit, an approval
--      whose content no longer matches — or whose total is below the current
--      one — is archived and that step is asked again.
--      A vendor change on an APPROVED requisition / PO by a non-admin now
--      re-opens approval in the database itself (the app also re-submits).
--      Non-admins can't change the vendor once the record is ordered.
--  D3  After a rejection the next submit restarts the whole chain; approvals
--      given before the rejection are not carried over.
--  D4  A PO created from an approved requisition is approved on submit when
--      its lines are covered by the requisition (same product and project, no
--      higher unit cost, cumulative quantity across the requisition's live POs
--      within the requisition's) and the live POs' combined total is within
--      the requisition's approved total (1 cent per PO of tax-rounding slack).
--      Otherwise the PO goes through its normal chain.
--  F4  decide_approval: before the last step completes, if the lines / total
--      changed since the chain was built (an approval is stale, or a step whose
--      threshold the current total now crosses has no approval), the chain is
--      rebuilt and the record stays pending.
--  Also: a PO with goods received against it can no longer be canceled
--      (owner decision D5 — Mark Complete closes it short instead).
--
-- Self-approval stays allowed (D1, no change).
--
-- PROD: apply before or after the code deploy. With the old app code a vendor
-- change on an approved record is re-opened by the database itself; the new
-- code only adds the explicit re-submit and the Cancel / Close buttons.

ALTER TABLE public.approval_requests ADD COLUMN IF NOT EXISTS content_hash text;
COMMENT ON COLUMN public.approval_requests.content_hash IS
  'Requisition / PO approvals: md5 of the vendor and line content the approver approved (_procurement_content_hash). A later mismatch re-opens that step.';

-- ── Content fingerprint ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._procurement_content_hash(p_entity_type text, p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vendor uuid;
  v_lines  text;
begin
  if p_entity_type = 'purchase_order' then
    select vendor_id into v_vendor from public.purchase_orders where id = p_id;
    select string_agg(l, '|' order by l) into v_lines from (
      select concat_ws(':', coalesce(li.product_item_id::text, '-'), coalesce(li.part_id::text, '-'),
                       trim_scale(coalesce(li.quantity, 0))::text, trim_scale(coalesce(li.unit_cost, 0))::text,
                       (li.taxable is distinct from false)::text, coalesce(li.project_id::text, '-')) as l
        from public.po_line_items li where li.po_id = p_id) x;
  elsif p_entity_type = 'requisition' then
    select vendor_id into v_vendor from public.requisitions where id = p_id;
    select string_agg(l, '|' order by l) into v_lines from (
      select concat_ws(':', coalesce(li.product_item_id::text, '-'), coalesce(li.part_id::text, '-'),
                       trim_scale(coalesce(li.quantity, 0))::text, trim_scale(coalesce(li.unit_cost, 0))::text,
                       'true', coalesce(li.project_id::text, '-')) as l
        from public.requisition_line_items li where li.requisition_id = p_id) x;
  else
    return null;
  end if;
  return md5(coalesce(v_vendor::text, '-') || '#' || coalesce(v_lines, ''));
end;
$function$;

-- Approvals given before this migration are taken to cover the record as it
-- stands now (a one-time baseline; every later change is compared to it).
UPDATE public.approval_requests a
   SET content_hash = public._procurement_content_hash(a.entity_type, a.entity_id)
 WHERE NOT a.archived AND a.status = 'approved' AND a.content_hash IS NULL
   AND a.entity_type IN ('requisition', 'purchase_order');

-- ── PO covered by its approved requisition (D4) ─────────────────────────────
CREATE OR REPLACE FUNCTION public._po_covered_by_requisition(p_po_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_po    record;
  v_req   record;
  v_count integer;
  v_sum   bigint;
begin
  select id, org_id, requisition_id into v_po
    from public.purchase_orders where id = p_po_id and deleted_at is null;
  if v_po.requisition_id is null then
    return false;
  end if;
  select id, org_id, status, approved_total_cents into v_req
    from public.requisitions where id = v_po.requisition_id and deleted_at is null;
  if v_req.id is null or v_req.org_id <> v_po.org_id
     or v_req.status not in ('approved', 'ordered') or v_req.approved_total_cents is null then
    return false;
  end if;

  -- Every line must be a catalog line, and there must be at least one.
  if not exists (select 1 from public.po_line_items where po_id = p_po_id)
     or exists (select 1 from public.po_line_items where po_id = p_po_id and product_item_id is null) then
    return false;
  end if;

  -- Each line matches a requisition line: same product and project, unit cost
  -- no higher than requested (a hair of slack for dollars->cents float noise).
  if exists (
    select 1 from public.po_line_items pl
     where pl.po_id = p_po_id
       and not exists (
         select 1 from public.requisition_line_items rl
          where rl.requisition_id = v_req.id
            and rl.product_item_id = pl.product_item_id
            and rl.project_id is not distinct from pl.project_id
            and pl.unit_cost <= rl.unit_cost + 0.001)) then
    return false;
  end if;

  -- Across every live PO made from this requisition (this one included),
  -- the quantity per product / project stays within the requisition's ...
  if exists (
    select 1
      from (select pl.product_item_id, pl.project_id, sum(pl.quantity) as q
              from public.po_line_items pl
              join public.purchase_orders p on p.id = pl.po_id
             where p.requisition_id = v_req.id and p.org_id = v_req.org_id and p.deleted_at is null
               and (p.status not in ('canceled', 'rejected') or p.id = p_po_id)
             group by 1, 2) po_q
     where po_q.q > coalesce((select sum(rl.quantity) from public.requisition_line_items rl
                               where rl.requisition_id = v_req.id
                                 and rl.product_item_id = po_q.product_item_id
                                 and rl.project_id is not distinct from po_q.project_id), 0) + 0.0005) then
    return false;
  end if;

  -- ... and their combined total stays within what was approved.
  select count(*), coalesce(sum(p.grand_total), 0) into v_count, v_sum
    from public.purchase_orders p
   where p.requisition_id = v_req.id and p.org_id = v_req.org_id and p.deleted_at is null
     and (p.status not in ('canceled', 'rejected') or p.id = p_po_id);
  return v_sum <= v_req.approved_total_cents + v_count;
end;
$function$;

-- ── Chain builder (shared by submit_for_approval and decide_approval) ───────
CREATE OR REPLACE FUNCTION public._approval_build_chain(
  p_entity_type text, p_entity_id uuid, p_org uuid, p_bypass_manager boolean, p_total integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total     integer := coalesce(p_total, 0);
  v_flow_id   uuid;
  v_step      record;
  v_required  boolean;
  v_status    text;
  v_pending   integer := 0;
  v_approved_steps uuid[];
  v_hash      text;
  v_approved_total integer;
  v_procurement boolean := p_entity_type IN ('requisition', 'purchase_order');
BEGIN
  PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'pending');

  IF v_procurement THEN
    v_hash := public._procurement_content_hash(p_entity_type, p_entity_id);
    v_approved_total := CASE p_entity_type
      WHEN 'requisition'    THEN (SELECT approved_total_cents FROM public.requisitions WHERE id = p_entity_id)
      ELSE (SELECT approved_total_cents FROM public.purchase_orders WHERE id = p_entity_id) END;
  END IF;

  -- D3: after a rejection the whole chain starts over (requisitions / POs;
  -- estimate approvals keep their own rules).
  IF v_procurement AND EXISTS (SELECT 1 FROM public.approval_requests
              WHERE entity_type = p_entity_type AND entity_id = p_entity_id
                AND NOT archived AND status = 'rejected') THEN
    UPDATE public.approval_requests SET archived = true
     WHERE entity_type = p_entity_type AND entity_id = p_entity_id
       AND NOT archived AND status = 'approved';
  END IF;

  SELECT id INTO v_flow_id FROM public.approval_flows
   WHERE org_id = p_org AND entity_type = p_entity_type AND deleted_at IS NULL
   ORDER BY created_at, id
   LIMIT 1;

  DELETE FROM public.approval_requests
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('pending', 'superseded');
  UPDATE public.approval_requests SET archived = true
   WHERE entity_type = p_entity_type AND entity_id = p_entity_id
     AND NOT archived AND status IN ('rejected', 'skipped');

  -- An approval only covers what its approver saw. Requisitions / POs: the
  -- vendor + lines (D2) and the total. Estimates: the total.
  IF v_procurement THEN
    UPDATE public.approval_requests SET archived = true
     WHERE entity_type = p_entity_type AND entity_id = p_entity_id
       AND NOT archived AND status = 'approved'
       AND (
         content_hash IS DISTINCT FROM v_hash
         OR (entity_total_cents IS NOT NULL AND v_total > entity_total_cents)
         OR (entity_total_cents IS NULL AND (v_approved_total IS NULL OR v_total > v_approved_total))
       );
  ELSE
    UPDATE public.approval_requests SET archived = true
     WHERE entity_type = p_entity_type AND entity_id = p_entity_id
       AND NOT archived AND status = 'approved'
       AND (entity_total_cents IS NULL OR v_total > entity_total_cents);
  END IF;

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
      v_status := CASE WHEN NOT v_required OR (coalesce(p_bypass_manager, false) AND v_step.required_role = 'manager')
                       THEN 'skipped' ELSE 'pending' END;

      IF v_step.assigned_user_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.profiles pa
                      WHERE pa.id = v_step.assigned_user_id AND pa.org_id = p_org AND pa.status = 'active') THEN
        INSERT INTO public.approval_requests
          (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
        SELECT p_org, p_entity_type, p_entity_id, v_step.id, v_step."order", v_step.assigned_user_id,
               coalesce((SELECT name FROM public.profiles WHERE id = v_step.assigned_user_id), 'Unknown'),
               v_step.required_role, v_status, v_total;
      ELSIF p_entity_type = 'crm_estimate' THEN
        WITH ins AS (
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT p_org, p_entity_type, p_entity_id, v_step.id, v_step."order", e.user_id,
                 e.first_name || ' ' || e.last_name, v_step.required_role, v_status, v_total
            FROM public.crm_employees e
           WHERE e.org_id = p_org AND e.deleted_at IS NULL AND e.user_id IS NOT NULL
             AND e.is_active
             AND EXISTS (SELECT 1 FROM public.profiles pe
                          WHERE pe.id = e.user_id AND pe.org_id = p_org AND pe.status = 'active')
             AND e.crm_role_id::text = v_step.required_role
          RETURNING 1
        ) SELECT count(*) INTO v_pending FROM ins;

        -- Nobody holds the required role: fall back to the org's first active
        -- admin, the same as the PO/requisition path.
        IF v_pending = 0 THEN
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT p_org, p_entity_type, p_entity_id, v_step.id, v_step."order", a.id, a.name,
                 v_step.required_role, v_status, v_total
            FROM (SELECT id, name FROM public.profiles
                   WHERE org_id = p_org AND role = 'admin' AND status = 'active'
                   ORDER BY created_at LIMIT 1) a;
        END IF;
      ELSE
        WITH targets AS (
          SELECT id, name FROM public.profiles
           WHERE org_id = p_org AND role = v_step.required_role AND status = 'active'
        ), fallback AS (
          SELECT id, name FROM targets
          UNION ALL
          (SELECT id, name FROM public.profiles
            WHERE org_id = p_org AND role = 'admin' AND status = 'active'
              AND NOT EXISTS (SELECT 1 FROM targets)
            ORDER BY created_at LIMIT 1)
        ), ins AS (
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT p_org, p_entity_type, p_entity_id, v_step.id, v_step."order", f.id, f.name,
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
  RETURN v_pending;
END;
$function$;

-- ── submit_for_approval ─────────────────────────────────────────────────────
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
  v_pending   integer := 0;
BEGIN
  SELECT org_id, role INTO v_org, v_role
    FROM public.profiles WHERE id = v_uid AND status = 'active';
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  -- Equipt viewers are read-only; requestors may only keep requisitions in
  -- draft. (Estimate approvals follow the Landscapt role.)
  IF v_role IN ('viewer', 'requestor') AND p_entity_type IN ('requisition', 'purchase_order') THEN
    RAISE EXCEPTION 'Your role can''t submit records for approval' USING ERRCODE = '42501';
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
    SELECT org_id, coalesce(approval_amount_cents, total_cents) INTO v_ent_org, v_total
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
  IF v_ent_status = 'canceled' THEN
    RAISE EXCEPTION 'This purchase order is canceled — reset it to Requested before submitting it'
      USING ERRCODE = '42501';
  END IF;

  -- The stored grand_total is derived from the line items, but recompute it
  -- here too so a record is never approved on a figure the lines don't support.
  IF p_entity_type IN ('requisition', 'purchase_order') THEN
    v_total := coalesce(public._procurement_refresh_totals(p_entity_type, p_entity_id, false), v_total);
  END IF;

  -- D4: a PO whose lines and total its approved requisition already covers
  -- needs no approval of its own.
  IF p_entity_type = 'purchase_order' AND public._po_covered_by_requisition(p_entity_id) THEN
    DELETE FROM public.approval_requests
     WHERE entity_type = p_entity_type AND entity_id = p_entity_id
       AND NOT archived AND status IN ('pending', 'superseded');
    UPDATE public.approval_requests SET archived = true
     WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND NOT archived;
    PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'approved');
    RETURN jsonb_build_object('auto_approved', true, 'covered_by_requisition', true);
  END IF;

  v_pending := public._approval_build_chain(p_entity_type, p_entity_id, v_org, v_role = 'admin', v_total);

  IF v_pending = 0 THEN
    PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'approved');
    RETURN jsonb_build_object('auto_approved', true);
  END IF;

  RETURN jsonb_build_object('auto_approved', false);
END;
$function$;

-- ── decide_approval ─────────────────────────────────────────────────────────
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
  v_procurement boolean;
  v_total   integer;
  v_hash    text;
  v_flow_id uuid;
  v_rebuild boolean := false;
  v_bypass  boolean;
  v_pending integer;
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
  -- like everyone else.
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

  v_procurement := v_req.entity_type IN ('requisition', 'purchase_order');
  IF v_procurement THEN
    v_total := coalesce(public._procurement_refresh_totals(v_req.entity_type, v_req.entity_id, false), 0);
    v_hash  := public._procurement_content_hash(v_req.entity_type, v_req.entity_id);
  END IF;

  -- A requisition / PO approval records what the approver saw (D2).
  UPDATE public.approval_requests
     SET status = p_status, comment = p_comment, decided_at = now(),
         content_hash = CASE WHEN v_procurement AND p_status = 'approved' THEN v_hash ELSE content_hash END,
         entity_total_cents = CASE WHEN v_procurement AND p_status = 'approved' THEN v_total ELSE entity_total_cents END
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
    -- F4: the chain was built for the record as submitted. If its lines or
    -- total changed since — an earlier approval no longer matches, or the
    -- total now crosses a threshold no step covers — ask again instead of
    -- approving.
    IF v_procurement THEN
      v_rebuild := EXISTS (
        SELECT 1 FROM public.approval_requests a
         WHERE a.entity_type = v_req.entity_type AND a.entity_id = v_req.entity_id
           AND NOT a.archived AND a.status = 'approved'
           AND (a.content_hash IS DISTINCT FROM v_hash OR coalesce(a.entity_total_cents, -1) < v_total));
      IF NOT v_rebuild THEN
        SELECT id INTO v_flow_id FROM public.approval_flows
         WHERE org_id = v_req.org_id AND entity_type = v_req.entity_type AND deleted_at IS NULL
         ORDER BY created_at, id LIMIT 1;
        v_rebuild := EXISTS (
          SELECT 1 FROM public.approval_flow_steps s
           WHERE s.flow_id = v_flow_id
             AND (s.threshold_cents = 0 OR v_total >= s.threshold_cents)
             AND NOT EXISTS (
               SELECT 1 FROM public.approval_requests a
                WHERE a.entity_type = v_req.entity_type AND a.entity_id = v_req.entity_id
                  AND NOT a.archived AND a.flow_step_id = s.id
                  AND (a.status = 'approved'
                       -- skipped although its threshold was met = the
                       -- submitter's admin bypass of a manager step
                       OR (a.status = 'skipped'
                           AND (s.threshold_cents = 0 OR coalesce(a.entity_total_cents, 0) >= s.threshold_cents)))));
      END IF;

      IF v_rebuild THEN
        SELECT EXISTS (
          SELECT 1 FROM public.approval_requests a
            JOIN public.approval_flow_steps s ON s.id = a.flow_step_id
           WHERE a.entity_type = v_req.entity_type AND a.entity_id = v_req.entity_id
             AND NOT a.archived AND a.status = 'skipped' AND s.required_role = 'manager'
             AND (s.threshold_cents = 0 OR coalesce(a.entity_total_cents, 0) >= s.threshold_cents))
          INTO v_bypass;
        v_pending := public._approval_build_chain(v_req.entity_type, v_req.entity_id, v_req.org_id, v_bypass, v_total);
        IF v_pending > 0 THEN
          RETURN jsonb_build_object('entity_type', v_req.entity_type, 'entity_id', v_req.entity_id,
                                    'new_entity_status', NULL, 'chain_rebuilt', true);
        END IF;
      END IF;
    END IF;

    PERFORM public._approval_set_entity_status(v_req.entity_type, v_req.entity_id, 'approved');
    RETURN jsonb_build_object('entity_type', v_req.entity_type, 'entity_id', v_req.entity_id, 'new_entity_status', 'approved');
  END IF;

  RETURN jsonb_build_object('entity_type', v_req.entity_type, 'entity_id', v_req.entity_id, 'new_entity_status', NULL);
END;
$function$;

-- ── Header guard: vendor lock past ordering, no cancel after a receipt ──────
CREATE OR REPLACE FUNCTION public.guard_procurement_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean;
BEGIN
  -- D5: a PO with goods received against it can't be canceled by anyone —
  -- Mark Complete closes it short instead. (Receipts with nothing received,
  -- or deleted receipts, don't count.)
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'purchase_orders'
     AND NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM 'canceled'
     AND EXISTS (SELECT 1 FROM public.goods_receipt_lines grl
                   JOIN public.goods_receipts gr ON gr.id = grl.receipt_id AND gr.deleted_at IS NULL
                  WHERE gr.purchase_order_id = NEW.id AND grl.quantity_received > 0) THEN
    RAISE EXCEPTION 'Goods have already been received on this PO, so it can''t be canceled — use Mark Complete to close it short'
      USING ERRCODE = '42501';
  END IF;

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

  -- D2: once ordered, the vendor is part of what was sent out — only an admin
  -- can change it. (On an approved record the change re-opens approval; see
  -- procurement_reopen_on_vendor_change.)
  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     AND ((TG_TABLE_NAME = 'purchase_orders' AND OLD.status IN ('ordered', 'partially_fulfilled', 'completed', 'canceled'))
          OR (TG_TABLE_NAME = 'requisitions' AND OLD.status IN ('ordered', 'closed'))) THEN
    RAISE EXCEPTION 'This % is already % — only an admin can change its vendor',
      CASE TG_TABLE_NAME WHEN 'purchase_orders' THEN 'purchase order' ELSE 'requisition' END,
      replace(OLD.status, '_', ' ')
      USING ERRCODE = '42501';
  END IF;

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
$function$;

-- ── Vendor change on an approved record re-opens approval (D2) ──────────────
CREATE OR REPLACE FUNCTION public.procurement_reopen_on_vendor_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entity text := CASE TG_TABLE_NAME WHEN 'purchase_orders' THEN 'purchase_order' ELSE 'requisition' END;
  v_role   text;
  v_total  integer;
BEGIN
  -- Admin / service-role / RPC edits keep the approval (the app re-submits
  -- after an admin's edit itself), like line edits.
  IF public._approval_actor_is_privileged() THEN
    RETURN NULL;
  END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  v_total := coalesce(public._procurement_refresh_totals(v_entity, NEW.id, false), NEW.grand_total, 0);
  IF public._approval_build_chain(v_entity, NEW.id, NEW.org_id, v_role = 'admin', v_total) = 0 THEN
    PERFORM public._approval_set_entity_status(v_entity, NEW.id, 'approved');
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_purchase_orders_reopen_on_vendor_change ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_reopen_on_vendor_change
  AFTER UPDATE OF vendor_id ON public.purchase_orders
  FOR EACH ROW
  WHEN (OLD.vendor_id IS DISTINCT FROM NEW.vendor_id AND OLD.status = 'approved' AND NEW.status = 'approved')
  EXECUTE FUNCTION public.procurement_reopen_on_vendor_change();

DROP TRIGGER IF EXISTS trg_requisitions_reopen_on_vendor_change ON public.requisitions;
CREATE TRIGGER trg_requisitions_reopen_on_vendor_change
  AFTER UPDATE OF vendor_id ON public.requisitions
  FOR EACH ROW
  WHEN (OLD.vendor_id IS DISTINCT FROM NEW.vendor_id AND OLD.status = 'approved' AND NEW.status = 'approved')
  EXECUTE FUNCTION public.procurement_reopen_on_vendor_change();

-- Internal helpers: not callable from the API.
REVOKE ALL ON FUNCTION public._procurement_content_hash(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._po_covered_by_requisition(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._approval_build_chain(text, uuid, uuid, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.procurement_reopen_on_vendor_change() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._procurement_content_hash(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._po_covered_by_requisition(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._approval_build_chain(text, uuid, uuid, boolean, integer) TO service_role;
