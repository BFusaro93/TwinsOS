-- Round 13 / purchasing F1: guard_procurement_line_items failed every
-- non-admin UPDATE of a requisition or PO line with 42703.
--
-- The trigger body is shared by po_line_items and requisition_line_items. The
-- parent-move check was one boolean:
--   TG_TABLE_NAME = 'po_line_items' and OLD.po_id is distinct from NEW.po_id
-- PL/pgSQL plans that whole expression against the firing table, so on
-- requisition_line_items "OLD.po_id" does not exist (and vice versa for
-- OLD.requisition_id on po_line_items) — 42703 for every manager / technician /
-- purchaser editing a line's quantity, cost, product or taxable flag.
-- Parent ids are now read through to_jsonb(), like procurement_line_refresh_header.
--
-- Also (owner decision D2, "any line change after approval re-opens approval"):
-- a change of project, maintenance part or parent record now counts as a line
-- change too. Before, a line could be moved to another PO / requisition, or
-- re-assigned to another project, without any check at all.
--
-- Safe to apply to PROD before or after the code deploy (the live app already
-- re-submits after every line add / edit / delete).

CREATE OR REPLACE FUNCTION public.guard_procurement_line_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old        jsonb;
  v_new        jsonb;
  v_parent_col text := case TG_TABLE_NAME when 'po_line_items' then 'po_id' else 'requisition_id' end;
  v_parent_id  uuid;
  v_old_parent uuid;
  v_status     text;
  v_entity     text;
  v_locked     boolean;
  v_old_locked boolean;
begin
  if TG_OP <> 'INSERT' then v_old := to_jsonb(OLD); end if;
  if TG_OP <> 'DELETE' then v_new := to_jsonb(NEW); end if;

  if TG_OP = 'UPDATE'
     and (v_new -> 'quantity')        is not distinct from (v_old -> 'quantity')
     and (v_new -> 'unit_cost')       is not distinct from (v_old -> 'unit_cost')
     and (v_new -> 'product_item_id') is not distinct from (v_old -> 'product_item_id')
     and (v_new -> 'part_id')         is not distinct from (v_old -> 'part_id')
     and (v_new -> 'project_id')      is not distinct from (v_old -> 'project_id')
     -- requisition_line_items has no taxable column; jsonb keeps one body.
     and (v_new -> 'taxable')         is not distinct from (v_old -> 'taxable')
     and (v_new -> v_parent_col)      is not distinct from (v_old -> v_parent_col)
  then
    return NEW;
  end if;

  if public._approval_actor_is_privileged() then
    return coalesce(NEW, OLD);
  end if;

  v_parent_id := (coalesce(v_new, v_old) ->> v_parent_col)::uuid;

  if TG_TABLE_NAME = 'po_line_items' then
    v_entity := 'purchase_order';
    select status into v_status from public.purchase_orders where id = v_parent_id;
    v_locked := v_status in ('ordered', 'partially_fulfilled', 'completed', 'canceled');
  else
    v_entity := 'requisition';
    select status into v_status from public.requisitions where id = v_parent_id;
    v_locked := v_status in ('ordered', 'closed');
  end if;
  v_locked := coalesce(v_locked, false);

  -- An UPDATE that moves the line to another parent must satisfy both, and
  -- the record it leaves is re-opened if it was approved.
  if TG_OP = 'UPDATE' then
    v_old_parent := (v_old ->> v_parent_col)::uuid;
    if v_old_parent is distinct from v_parent_id and v_old_parent is not null then
      if TG_TABLE_NAME = 'po_line_items' then
        select status in ('ordered', 'partially_fulfilled', 'completed', 'canceled'), status
          into v_old_locked, v_status
          from public.purchase_orders where id = v_old_parent;
      else
        select status in ('ordered', 'closed'), status
          into v_old_locked, v_status
          from public.requisitions where id = v_old_parent;
      end if;
      if coalesce(v_old_locked, false) then
        raise exception 'This % is already % — only an admin can change its line items',
          replace(v_entity, '_', ' '), replace(v_status, '_', ' ')
          using errcode = '42501';
      end if;
      if v_status = 'approved' then
        perform public._approval_set_entity_status(v_entity, v_old_parent, 'pending');
      end if;
      -- Re-read the destination's status for the checks below.
      if TG_TABLE_NAME = 'po_line_items' then
        select status into v_status from public.purchase_orders where id = v_parent_id;
      else
        select status into v_status from public.requisitions where id = v_parent_id;
      end if;
    end if;
  end if;

  if v_locked then
    raise exception 'This % is already % — only an admin can change its line items',
      replace(v_entity, '_', ' '), replace(v_status, '_', ' ')
      using errcode = '42501';
  end if;

  if v_status = 'approved' then
    -- The approval covered the old lines; send it back through the chain.
    perform public._approval_set_entity_status(v_entity, v_parent_id, 'pending');
  end if;

  return coalesce(NEW, OLD);
end;
$function$;
