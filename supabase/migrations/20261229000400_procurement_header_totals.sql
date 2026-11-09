-- Equipt procurement: PO / requisition totals are derived in the database.
--
-- subtotal / sales_tax / grand_total on purchase_orders and requisitions were
-- written by the browser and nothing recomputed them from the line items, while
-- submit_for_approval and the approval-status guard trusted grand_total. A
-- technician could add a $25,000 line, PATCH grand_total = 100 and be
-- auto-approved under a $500 threshold. Now:
--   * procurement_totals() is the one formula (same as src/lib/utils/po-tax.ts):
--       subtotal       = round(sum(quantity * unit_cost))           (all lines)
--       taxable        = round(sum(quantity * unit_cost))           (taxable lines;
--                        every requisition line is taxable)
--       discount share = round(discount * taxable / subtotal)       (only when
--                        discount_reduces_tax — the discount is spread across
--                        taxable and non-taxable lines by their share)
--       sales_tax      = round(max(0, taxable - share) * rate / 100)   (or
--                        round(taxable * rate / 100) when it doesn't reduce tax)
--       grand_total    = subtotal - discount + sales_tax + shipping
--   * a BEFORE trigger on each header recomputes those three columns whenever a
--     totals input changes (rate, shipping, discount, the flag, or any of the
--     three totals themselves), so a PATCHed total is simply overwritten;
--   * an AFTER trigger on each line table recomputes the header whenever a
--     line's quantity / cost / taxable flag / parent changes;
--   * a BEFORE trigger on each line table derives total_cost from quantity and
--     unit_cost;
--   * submit_for_approval recomputes before it reads the total.
-- A header with no line items (header-only CSV imports) keeps the subtotal it
-- was given; the tax and grand total are still derived from it.
--
-- The trigger names sort before trg_guard_* so the approval guard sees the
-- recomputed total (BEFORE triggers fire in name order).

create or replace function public.procurement_totals(
  p_subtotal numeric,
  p_taxable_subtotal numeric,
  p_tax_rate_percent numeric,
  p_discount_cost integer,
  p_discount_reduces_tax boolean,
  p_shipping_cost integer,
  out subtotal integer,
  out sales_tax integer,
  out grand_total integer
)
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v_taxable  numeric;
  v_discount numeric := coalesce(p_discount_cost, 0);
  v_share    numeric := 0;
begin
  subtotal  := round(coalesce(p_subtotal, 0));
  v_taxable := round(coalesce(p_taxable_subtotal, 0));
  if coalesce(p_discount_reduces_tax, false) and v_discount <> 0 and subtotal > 0 and v_taxable > 0 then
    v_share := round(v_discount * v_taxable / subtotal);
  end if;
  if coalesce(p_discount_reduces_tax, false) then
    v_taxable := greatest(0, v_taxable - v_share);
  end if;
  sales_tax   := round(v_taxable * coalesce(p_tax_rate_percent, 0) / 100);
  grand_total := subtotal - v_discount::integer + sales_tax + coalesce(p_shipping_cost, 0);
end;
$$;

comment on function public.procurement_totals(numeric, numeric, numeric, integer, boolean, integer) is
  'PO/requisition header totals from line sums. Mirrors computeSalesTax() in src/lib/utils/po-tax.ts — change both together.';

-- Line sums for one header: (line count, raw subtotal, raw taxable subtotal).
create or replace function public._procurement_line_sums(
  p_entity_type text,
  p_id uuid,
  out line_count integer,
  out subtotal numeric,
  out taxable_subtotal numeric
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if p_entity_type = 'purchase_order' then
    select count(*)::integer,
           coalesce(sum(li.quantity * li.unit_cost), 0),
           coalesce(sum(li.quantity * li.unit_cost) filter (where li.taxable is distinct from false), 0)
      into line_count, subtotal, taxable_subtotal
      from public.po_line_items li
     where li.po_id = p_id;
  else
    select count(*)::integer,
           coalesce(sum(li.quantity * li.unit_cost), 0),
           coalesce(sum(li.quantity * li.unit_cost), 0)
      into line_count, subtotal, taxable_subtotal
      from public.requisition_line_items li
     where li.requisition_id = p_id;
  end if;
end;
$$;

-- BEFORE INSERT/UPDATE on purchase_orders and requisitions.
create or replace function public.procurement_compute_header_totals()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_entity text := case TG_TABLE_NAME when 'purchase_orders' then 'purchase_order' else 'requisition' end;
  v_sums   record;
  v_sub    numeric;
  v_tax    numeric;
  v_t      record;
begin
  if TG_OP = 'UPDATE'
     and NEW.subtotal             is not distinct from OLD.subtotal
     and NEW.sales_tax            is not distinct from OLD.sales_tax
     and NEW.grand_total          is not distinct from OLD.grand_total
     and NEW.tax_rate_percent     is not distinct from OLD.tax_rate_percent
     and NEW.shipping_cost        is not distinct from OLD.shipping_cost
     and NEW.discount_cost        is not distinct from OLD.discount_cost
     and NEW.discount_reduces_tax is not distinct from OLD.discount_reduces_tax
  then
    return NEW;
  end if;

  select * into v_sums from public._procurement_line_sums(v_entity, NEW.id);
  if v_sums.line_count > 0 then
    v_sub := v_sums.subtotal;
    v_tax := v_sums.taxable_subtotal;
  else
    -- No lines (yet): a new header is inserted before its lines, and
    -- header-only imports never get any. Keep the subtotal it carries.
    v_sub := coalesce(NEW.subtotal, 0);
    v_tax := v_sub;
  end if;

  select * into v_t from public.procurement_totals(
    v_sub, v_tax, NEW.tax_rate_percent, NEW.discount_cost, NEW.discount_reduces_tax, NEW.shipping_cost);
  NEW.subtotal    := v_t.subtotal;
  NEW.sales_tax   := v_t.sales_tax;
  NEW.grand_total := v_t.grand_total;
  return NEW;
end;
$$;

-- Recompute one header's stored totals from its lines; returns the grand total
-- (null when the header doesn't exist). p_from_lines: called because a line
-- changed — with no lines left the subtotal is 0, not whatever it was.
create or replace function public._procurement_refresh_totals(
  p_entity_type text,
  p_id uuid,
  p_from_lines boolean default false
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_h    record;
  v_sums record;
  v_sub  numeric;
  v_tax  numeric;
  v_t    record;
begin
  if p_id is null then
    return null;
  end if;
  if p_entity_type = 'purchase_order' then
    select subtotal, sales_tax, grand_total, tax_rate_percent, discount_cost, discount_reduces_tax, shipping_cost
      into v_h from public.purchase_orders where id = p_id;
  elsif p_entity_type = 'requisition' then
    select subtotal, sales_tax, grand_total, tax_rate_percent, discount_cost, discount_reduces_tax, shipping_cost
      into v_h from public.requisitions where id = p_id;
  else
    raise exception 'Unknown procurement entity type %', p_entity_type;
  end if;
  if not found then
    return null;
  end if;

  select * into v_sums from public._procurement_line_sums(p_entity_type, p_id);
  if v_sums.line_count > 0 then
    v_sub := v_sums.subtotal;
    v_tax := v_sums.taxable_subtotal;
  else
    v_sub := case when p_from_lines then 0 else coalesce(v_h.subtotal, 0) end;
    v_tax := v_sub;
  end if;
  select * into v_t from public.procurement_totals(
    v_sub, v_tax, v_h.tax_rate_percent, v_h.discount_cost, v_h.discount_reduces_tax, v_h.shipping_cost);

  if (v_t.subtotal, v_t.sales_tax, v_t.grand_total)
     is distinct from (v_h.subtotal, v_h.sales_tax, v_h.grand_total) then
    -- The header trigger recomputes the same figures from the lines.
    if p_entity_type = 'purchase_order' then
      update public.purchase_orders
         set subtotal = v_t.subtotal, sales_tax = v_t.sales_tax, grand_total = v_t.grand_total
       where id = p_id;
    else
      update public.requisitions
         set subtotal = v_t.subtotal, sales_tax = v_t.sales_tax, grand_total = v_t.grand_total
       where id = p_id;
    end if;
  end if;
  return v_t.grand_total;
end;
$$;

revoke all on function public._procurement_refresh_totals(text, uuid, boolean) from public, anon, authenticated;
revoke all on function public._procurement_line_sums(text, uuid) from public, anon, authenticated;

-- BEFORE INSERT/UPDATE on the line tables: total_cost is quantity x unit cost.
create or replace function public.procurement_compute_line_total()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  NEW.total_cost := round(coalesce(NEW.quantity, 0) * coalesce(NEW.unit_cost, 0));
  return NEW;
end;
$$;

-- AFTER INSERT/UPDATE/DELETE on the line tables: refresh the header(s).
create or replace function public.procurement_line_refresh_header()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_entity text := case TG_TABLE_NAME when 'po_line_items' then 'purchase_order' else 'requisition' end;
  v_old_parent uuid;
  v_new_parent uuid;
begin
  if TG_OP <> 'INSERT' then
    v_old_parent := case TG_TABLE_NAME when 'po_line_items' then (to_jsonb(OLD) ->> 'po_id')::uuid
                                       else (to_jsonb(OLD) ->> 'requisition_id')::uuid end;
  end if;
  if TG_OP <> 'DELETE' then
    v_new_parent := case TG_TABLE_NAME when 'po_line_items' then (to_jsonb(NEW) ->> 'po_id')::uuid
                                       else (to_jsonb(NEW) ->> 'requisition_id')::uuid end;
  end if;

  if TG_OP = 'UPDATE'
     and v_old_parent is not distinct from v_new_parent
     and NEW.quantity  is not distinct from OLD.quantity
     and NEW.unit_cost is not distinct from OLD.unit_cost
     and (to_jsonb(NEW) -> 'taxable') is not distinct from (to_jsonb(OLD) -> 'taxable')
  then
    return null;
  end if;

  if v_old_parent is not null then
    perform public._procurement_refresh_totals(v_entity, v_old_parent, true);
  end if;
  if v_new_parent is not null and v_new_parent is distinct from v_old_parent then
    perform public._procurement_refresh_totals(v_entity, v_new_parent, true);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_compute_purchase_order_totals on public.purchase_orders;
create trigger trg_compute_purchase_order_totals
  before insert or update on public.purchase_orders
  for each row execute function public.procurement_compute_header_totals();

drop trigger if exists trg_compute_requisition_totals on public.requisitions;
create trigger trg_compute_requisition_totals
  before insert or update on public.requisitions
  for each row execute function public.procurement_compute_header_totals();

drop trigger if exists trg_compute_po_line_total on public.po_line_items;
create trigger trg_compute_po_line_total
  before insert or update of quantity, unit_cost, total_cost on public.po_line_items
  for each row execute function public.procurement_compute_line_total();

drop trigger if exists trg_compute_requisition_line_total on public.requisition_line_items;
create trigger trg_compute_requisition_line_total
  before insert or update of quantity, unit_cost, total_cost on public.requisition_line_items
  for each row execute function public.procurement_compute_line_total();

drop trigger if exists trg_po_line_items_refresh_header on public.po_line_items;
create trigger trg_po_line_items_refresh_header
  after insert or update or delete on public.po_line_items
  for each row execute function public.procurement_line_refresh_header();

drop trigger if exists trg_requisition_line_items_refresh_header on public.requisition_line_items;
create trigger trg_requisition_line_items_refresh_header
  after insert or update or delete on public.requisition_line_items
  for each row execute function public.procurement_line_refresh_header();

-- submit_for_approval: unchanged except that it recomputes the total first.
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

  -- The stored grand_total is derived from the line items (20261229000400),
  -- but recompute it here too so a row saved before that trigger existed (or
  -- one whose totals drifted) is never approved on a figure the lines don't
  -- support.
  IF p_entity_type IN ('requisition', 'purchase_order') THEN
    v_total := coalesce(public._procurement_refresh_totals(p_entity_type, p_entity_id, false), v_total);
  END IF;

  PERFORM public._approval_set_entity_status(p_entity_type, p_entity_id, 'pending');

  SELECT id INTO v_flow_id FROM public.approval_flows
   WHERE org_id = v_org AND entity_type = p_entity_type AND deleted_at IS NULL
   ORDER BY created_at, id
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

      IF v_step.assigned_user_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.profiles pa
                      WHERE pa.id = v_step.assigned_user_id AND pa.org_id = v_org AND pa.status = 'active') THEN
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
             AND e.is_active
             AND EXISTS (SELECT 1 FROM public.profiles pe
                          WHERE pe.id = e.user_id AND pe.org_id = v_org AND pe.status = 'active')
             AND e.crm_role_id::text = v_step.required_role
          RETURNING 1
        ) SELECT count(*) INTO v_pending FROM ins;

        -- Nobody holds the required role (deactivated, unlinked, role deleted): a step with no
        -- request rows used to count as nothing pending, so the estimate auto-approved with zero
        -- approvals. Fall back to the org's first active admin, the same as the PO/requisition path.
        IF v_pending = 0 THEN
          INSERT INTO public.approval_requests
            (org_id, entity_type, entity_id, flow_step_id, "order", approver_id, approver_name, approver_role, status, entity_total_cents)
          SELECT v_org, p_entity_type, p_entity_id, v_step.id, v_step."order", a.id, a.name,
                 v_step.required_role, v_status, v_total
            FROM (SELECT id, name FROM public.profiles
                   WHERE org_id = v_org AND role = 'admin' AND status = 'active'
                   ORDER BY created_at LIMIT 1) a;
        END IF;
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

-- ── Repair ──────────────────────────────────────────────────────────────────
-- Only records still in the approval stage are rewritten (PO: requested /
-- pending / approved / rejected; requisition: draft / pending_approval /
-- approved / rejected). Ordered / received / closed records keep the totals
-- they were bought and paid at; they are recomputed only when someone edits
-- their totals or lines. The approval GUC lets the rewrite past the approval
-- guard (it never changes status or approved_total_cents).
do $$
declare
  v_line integer := 0;
  v_id  uuid;
begin
  perform set_config('app.approval_rpc', 'on', true);

  with fixed as (
    update public.po_line_items li
       set total_cost = round(li.quantity * li.unit_cost)
      from public.purchase_orders po
     where po.id = li.po_id and po.deleted_at is null
       and po.status in ('requested', 'pending', 'approved', 'rejected')
       and li.total_cost is distinct from round(li.quantity * li.unit_cost)
    returning 1
  ) select count(*) into v_line from fixed;
  with fixed as (
    update public.requisition_line_items li
       set total_cost = round(li.quantity * li.unit_cost)
      from public.requisitions r
     where r.id = li.requisition_id and r.deleted_at is null
       and r.status in ('draft', 'pending_approval', 'approved', 'rejected')
       and li.total_cost is distinct from round(li.quantity * li.unit_cost)
    returning 1
  ) select v_line + count(*) into v_line from fixed;

  for v_id in
    select id from public.purchase_orders
     where deleted_at is null and status in ('requested', 'pending', 'approved', 'rejected')
  loop
    perform public._procurement_refresh_totals('purchase_order', v_id, false);
  end loop;
  for v_id in
    select id from public.requisitions
     where deleted_at is null and status in ('draft', 'pending_approval', 'approved', 'rejected')
  loop
    perform public._procurement_refresh_totals('requisition', v_id, false);
  end loop;

  perform set_config('app.approval_rpc', '', true);
  raise notice 'procurement totals repair: % line totals rewritten', v_line;
end;
$$;
