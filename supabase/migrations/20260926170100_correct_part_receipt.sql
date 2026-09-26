-- Receipt corrections / reversals that keep cost layers in step.
--
-- Receipt edits (use-goods-receipts), PO line deletes and the ReceiveGoods
-- rollback all called the 4-arg adjust_part_quantity(p_org_id, ...) overload,
-- which moves parts.quantity_on_hand but never touches cost_layers, and
-- RAISES when the result would go negative. So:
--   * a downward correction left the receipt's layer at its full quantity
--     (FIFO/WAC then valued stock that no longer existed), and
--   * reversing a receipt whose units were already used on work orders
--     failed outright, blocking the correction/delete.
--
-- correct_part_receipt(org, part, delta, unit_cost, po_number):
--   delta > 0  adds a cost layer for the extra units at p_unit_cost.
--   delta < 0  removes up to |delta| units, clamped to what is on hand;
--              taken from this PO's layers first (newest first), any
--              remainder FIFO from other layers. Never raises on shortfall.
-- Under WAC the part's unit cost is re-averaged from the remaining layers
-- (same rule as receive_part_quantity). Returns what was actually applied
-- so the caller can tell the user about any shortfall.

create or replace function public.correct_part_receipt(
  p_org_id     uuid,
  p_part_id    uuid,
  p_delta      integer,
  p_unit_cost  integer,
  p_po_number  text
)
returns table(old_qty integer, new_qty integer, requested_delta integer, applied_delta integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_user_id     uuid := auth.uid();
  v_user_name   text;
  v_old_qty     integer;
  v_new_qty     integer;
  v_old_cost    integer;
  v_new_cost    integer;
  v_part_name   text;
  v_product_id  uuid;
  v_layers      jsonb[];
  v_result      jsonb;
  v_take        integer;
  v_remaining   integer;
  v_layer_qty   numeric;
  v_step        numeric;
  v_cost_method text;
  v_total_qty   numeric;
  v_total_value numeric;
  v_applied     integer;
  i             int;
begin
  if v_user_id is null or p_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  select quantity_on_hand, unit_cost, name, product_item_id,
         array(select jsonb_array_elements(coalesce(cost_layers, '[]'::jsonb)))
    into v_old_qty, v_old_cost, v_part_name, v_product_id, v_layers
    from public.parts
    where id = p_part_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Part not found';
  end if;

  if coalesce(p_delta, 0) = 0 then
    old_qty := v_old_qty; new_qty := v_old_qty; requested_delta := 0; applied_delta := 0;
    return next;
    return;
  end if;

  if p_delta > 0 then
    v_applied := p_delta;
    v_layers := v_layers || jsonb_build_object(
      'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
      'quantity', p_delta,
      'unitCost', coalesce(p_unit_cost, v_old_cost),
      'receivedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'poNumber', p_po_number
    );
  else
    v_take := least(-p_delta, greatest(v_old_qty, 0));
    v_applied := -v_take;
    v_remaining := v_take;

    -- This PO's layers, newest first.
    if coalesce(p_po_number, '') <> '' and v_remaining > 0 then
      for i in reverse coalesce(array_length(v_layers, 1), 0) .. 1 loop
        exit when v_remaining <= 0;
        if v_layers[i]->>'poNumber' = p_po_number then
          v_layer_qty := coalesce((v_layers[i]->>'quantity')::numeric, 0);
          if v_layer_qty > 0 then
            v_step := least(v_layer_qty, v_remaining);
            v_layers[i] := jsonb_set(v_layers[i], '{quantity}', to_jsonb(v_layer_qty - v_step));
            v_remaining := v_remaining - v_step;
          end if;
        end if;
      end loop;
    end if;

    select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_result
      from unnest(v_layers) with ordinality as u(e, o);

    -- Anything left (layers already consumed, or legacy stock with no
    -- layer for this PO) comes off FIFO so layers keep matching on-hand.
    if v_remaining > 0 then
      v_result := public.decrement_cost_layers(v_result, v_remaining);
    end if;
    v_layers := array(select jsonb_array_elements(v_result));
  end if;

  select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_result
    from unnest(v_layers) with ordinality as u(e, o);

  v_new_qty := v_old_qty + v_applied;

  select cost_method into v_cost_method from public.organizations where id = p_org_id;
  v_new_cost := v_old_cost;
  if v_cost_method = 'wac' then
    select coalesce(sum((l->>'quantity')::numeric), 0),
           coalesce(sum((l->>'quantity')::numeric * (l->>'unitCost')::numeric), 0)
      into v_total_qty, v_total_value
      from jsonb_array_elements(v_result) l
      where (l->>'quantity')::numeric > 0;
    if v_total_qty > 0 then
      v_new_cost := round(v_total_value / v_total_qty);
    end if;
  end if;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
    set quantity_on_hand = v_new_qty,
        cost_layers      = v_result,
        unit_cost        = v_new_cost,
        updated_at       = now()
    where id = p_part_id and org_id = p_org_id;

  if v_product_id is not null and v_new_cost is distinct from v_old_cost then
    update public.product_items set unit_cost = v_new_cost
      where id = v_product_id and org_id = p_org_id;
  end if;

  if v_applied <> 0 then
    select name into v_user_name from public.profiles where id = v_user_id limit 1;
    insert into public.audit_log (
      org_id, created_by, record_type, record_id, action,
      changed_by_name, description, field_changed, old_value, new_value
    ) values (
      p_org_id, v_user_id, 'part', p_part_id, 'received',
      coalesce(v_user_name, 'System'),
      v_part_name || ': receipt correction ' || (case when v_applied > 0 then '+' else '' end) || v_applied
        || ' via PO ' || coalesce(nullif(p_po_number, ''), '(unknown)')
        || case when v_applied <> p_delta
             then ' (requested ' || p_delta || '; only ' || v_old_qty || ' on hand)'
             else '' end,
      'quantity_on_hand', v_old_qty::text, v_new_qty::text
    );
  end if;

  old_qty := v_old_qty;
  new_qty := v_new_qty;
  requested_delta := p_delta;
  applied_delta := v_applied;
  return next;
end;
$function$;

revoke execute on function public.correct_part_receipt(uuid, uuid, integer, integer, text) from public, anon;
grant execute on function public.correct_part_receipt(uuid, uuid, integer, integer, text) to authenticated;
