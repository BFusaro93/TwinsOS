-- Work-order part stock: untracked parts don't move stock, and returned units
-- go back at the cost they were used at.
--
-- 1. Untracked parts (parts.is_inventory = false — "not tracked as an
--    inventory item") were still decremented when added to a work order, and
--    because their quantity on hand is usually 0 every use clamped and was
--    recorded as a shortfall (wo_part_shortfalls, the "used without stock"
--    badge and the shortfall notification). set_wo_part_stock now treats an
--    untracked part's line as fully supplied without touching stock, and
--    adjust_part_quantity refuses to move an untracked part's stock as a
--    backstop. The shortfall view leaves untracked parts out.
--
-- 2. Units returned to stock from a work order (line removed or reduced, WO
--    skipped or deleted) got a new cost layer at the part's CURRENT unit_cost,
--    re-costing them at today's price. adjust_part_quantity takes the cost to
--    return at (p_return_unit_cost) and set_wo_part_stock passes the wo_parts
--    line's own unit_cost.
--
-- Replaces:
--   adjust_part_quantity(uuid, integer, uuid) — latest 20260928100000 /
--     rewritten by 20260929140000 (_equipt_org_mismatch). Re-created with a
--     4th defaulted parameter, so it is dropped first; grants re-stated.
--   set_wo_part_stock(uuid, integer) — latest 20261229000420.
--   wo_part_shortfalls view — 20261019000100 (same columns, security_invoker kept).
-- All existing guards are kept (auth.uid(), _equipt_org_mismatch, skipped-WO
-- holds no stock, null part lines).

drop function if exists public.adjust_part_quantity(uuid, integer, uuid);

create function public.adjust_part_quantity(
  p_part_id           uuid,
  p_delta             integer,
  p_work_order_id     uuid    default null,
  p_return_unit_cost  numeric default null
)
returns table(old_qty integer, new_qty integer, applied_delta integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id      uuid;
  v_user_name    text;
  v_org_id       uuid;
  v_old_qty      integer;
  v_new_qty      integer;
  v_part_name    text;
  v_wo_number    text;
  v_description  text;
  v_unit_cost    numeric;
  v_cost_layers  jsonb;
  v_applied      integer;
  v_is_inventory boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select name into v_user_name
    from public.profiles
    where id = v_user_id
    limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  select quantity_on_hand, name, org_id, unit_cost, cost_layers, is_inventory
    into v_old_qty, v_part_name, v_org_id, v_unit_cost, v_cost_layers, v_is_inventory
    from public.parts
    where id = p_part_id and deleted_at is null
    for update;
  if not found then
    return;
  end if;

  if public._equipt_org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  -- Untracked parts have no stock to move.
  if v_is_inventory is false then
    old_qty := v_old_qty;
    new_qty := v_old_qty;
    applied_delta := 0;
    return next;
    return;
  end if;

  v_new_qty := greatest(0, v_old_qty + p_delta);
  if v_new_qty = v_old_qty then
    old_qty := v_old_qty;
    new_qty := v_new_qty;
    applied_delta := 0;
    return next;
    return;
  end if;

  v_applied := v_new_qty - v_old_qty;

  if v_applied < 0 then
    v_cost_layers := public.decrement_cost_layers(v_cost_layers, abs(v_applied));
  else
    -- Returned units keep the cost they were used at (the work-order line's
    -- unit cost) instead of being re-costed at today's price.
    v_cost_layers := public.append_cost_layer(v_cost_layers, v_applied, coalesce(p_return_unit_cost, v_unit_cost));
  end if;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
  set quantity_on_hand = v_new_qty,
      cost_layers = v_cost_layers,
      updated_at = now()
  where id = p_part_id;

  if p_work_order_id is not null then
    select work_order_number into v_wo_number
      from public.work_orders
      where id = p_work_order_id;
  end if;

  v_description := v_part_name || ': ' ||
    case
      when v_wo_number is not null and p_delta < 0 then 'used ' || abs(p_delta) || ' on ' || v_wo_number
      when v_wo_number is not null and p_delta > 0 then 'returned ' || p_delta || ' from ' || v_wo_number
      else 'quantity adjusted'
    end;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
    v_user_name, v_description,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );

  old_qty := v_old_qty;
  new_qty := v_new_qty;
  applied_delta := v_applied;
  return next;
end;
$function$;

revoke all on function public.adjust_part_quantity(uuid, integer, uuid, numeric) from public, anon;
grant execute on function public.adjust_part_quantity(uuid, integer, uuid, numeric) to authenticated, service_role;


create or replace function public.set_wo_part_stock(p_wo_part_id uuid, p_target integer)
returns table(old_qty integer, new_qty integer, requested_delta integer, applied_delta integer, quantity_deducted integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_row        public.wo_parts%rowtype;
  v_deducted   integer;
  v_target     integer := greatest(0, coalesce(p_target, 0));
  v_req        integer;
  v_res        record;
  v_applied    integer := 0;
  v_old        integer;
  v_new        integer;
  v_tracked    boolean;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select * into v_row from public.wo_parts where id = p_wo_part_id for update;
  if not found then
    raise exception 'Work order part not found';
  end if;
  if public._equipt_org_mismatch(v_row.org_id) then
    raise exception 'Unauthorized';
  end if;

  -- A skipped work order holds no stock: wo_status_sync_part_stock returns its
  -- parts when it is skipped and takes them again when it is un-skipped. A
  -- part added or re-quantified while it is skipped used to be deducted anyway.
  if v_row.deleted_at is null
     and exists (select 1 from public.work_orders wo
                  where wo.id = v_row.work_order_id and wo.status = 'skipped') then
    v_target := 0;
  end if;

  v_deducted := coalesce(
    v_row.quantity_deducted,
    case when v_row.deleted_at is null then v_row.quantity else 0 end
  );

  if v_row.part_id is null then
    old_qty := null; new_qty := null;
    requested_delta := 0; applied_delta := 0;
    quantity_deducted := 0;
    return next;
    return;
  end if;

  -- An untracked part (not an inventory item) has no stock to take or
  -- return: the line counts as fully supplied, so it never shows as a
  -- shortfall and is never settled by a later receipt.
  select p.is_inventory into v_tracked from public.parts p where p.id = v_row.part_id;
  if v_tracked is false then
    perform set_config('app.suppress_audit', 'true', true);
    update public.wo_parts set quantity_deducted = v_target where id = p_wo_part_id;
    perform set_config('app.suppress_audit', '', true);
    old_qty := null; new_qty := null;
    requested_delta := 0; applied_delta := 0;
    quantity_deducted := v_target;
    return next;
    return;
  end if;

  v_req := v_deducted - v_target;

  if v_req <> 0 then
    -- Units coming back are returned at this line's own unit cost.
    select * into v_res
      from public.adjust_part_quantity(v_row.part_id, v_req, v_row.work_order_id, v_row.unit_cost::numeric);
    if found and v_res.applied_delta is not null then
      v_applied := v_res.applied_delta;
      v_old := v_res.old_qty;
      v_new := v_res.new_qty;
    end if;
    v_deducted := v_deducted - v_applied;
  end if;

  perform set_config('app.suppress_audit', 'true', true);
  update public.wo_parts set quantity_deducted = v_deducted where id = p_wo_part_id;
  perform set_config('app.suppress_audit', '', true);

  old_qty := v_old;
  new_qty := v_new;
  requested_delta := v_req;
  applied_delta := v_applied;
  quantity_deducted := v_deducted;
  return next;
end;
$function$;


create or replace view public.wo_part_shortfalls
with (security_invoker = on) as
select
  wp.id              as wo_part_id,
  wp.org_id,
  wp.part_id,
  wp.work_order_id,
  wo.work_order_number,
  wo.title           as work_order_title,
  wo.status          as work_order_status,
  wp.part_name,
  wp.part_number,
  wp.quantity,
  wp.quantity_deducted,
  wp.quantity - wp.quantity_deducted as short_qty,
  wp.created_at
from public.wo_parts wp
join public.work_orders wo on wo.id = wp.work_order_id
join public.parts p on p.id = wp.part_id
where wp.deleted_at is null
  and wo.deleted_at is null
  and wo.status <> 'skipped'
  and p.is_inventory
  and wp.part_id is not null
  and wp.quantity_deducted is not null
  and wp.quantity_deducted < wp.quantity;

grant select on public.wo_part_shortfalls to authenticated;

-- Existing untracked-part lines recorded as short are settled under the new
-- rule (no stock moves).
update public.wo_parts wp
   set quantity_deducted = wp.quantity
  from public.parts p
 where p.id = wp.part_id
   and p.is_inventory is false
   and wp.deleted_at is null
   and wp.quantity_deducted is not null
   and wp.quantity_deducted < wp.quantity;
