-- ============================================================
-- adjust_part_quantity: a $0 return cost no longer creates a $0 cost layer.
--
-- Returned units are costed at the work-order line's own unit_cost. A line
-- added while the part's catalog cost was still $0 (before its first PO
-- receipt) carries $0, so removing it created a live $0 layer and FIFO/WAC
-- then priced the part at $0 on every new WO / PO / requisition.
-- A $0 (or null) return cost now falls back to the part's current unit_cost.
-- Only that one expression changes versus 20270106000230.
-- ============================================================
create or replace function public.adjust_part_quantity(
  p_part_id uuid,
  p_delta integer,
  p_work_order_id uuid default null::uuid,
  p_return_unit_cost numeric default null::numeric
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
    v_cost_layers := public.append_cost_layer(v_cost_layers, v_applied, coalesce(nullif(p_return_unit_cost, 0), v_unit_cost));
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

  -- The quantity actually applied (stock never goes below 0), with the
  -- shortfall when a usage asked for more than was on hand.
  v_description := v_part_name || ': ' ||
    case
      when v_wo_number is not null and v_applied < 0 then
        'used ' || abs(v_applied) || ' on ' || v_wo_number
        || case when v_applied <> p_delta then ' (' || (v_applied - p_delta) || ' short)' else '' end
      when v_wo_number is not null and v_applied > 0 then 'returned ' || v_applied || ' from ' || v_wo_number
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
