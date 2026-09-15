-- Bug: parts.cost_layers / product_items.cost_layers are append-only.
-- receive_part_quantity()/receive_product_cost_layer() append a new layer on
-- every receipt, but nothing ever decrements a layer's `quantity` as stock is
-- consumed (WO parts usage, PM-generated WO parts, job_products usage) — only
-- the denormalized quantity_on_hand counter is adjusted. computeFIFO()/
-- computeWAC() (src/lib/cost-methods.ts) filter layers by `quantity > 0`, so
-- once a layer's real remaining units hit zero without the JSON ever
-- reflecting that, FIFO permanently returns that same stale "oldest" layer's
-- cost forever, and WAC's weighted average is diluted by phantom quantity —
-- both drifting further from the true remaining-inventory cost the longer a
-- part goes without a fresh receipt.
--
-- Fixed by having the two consumption-path RPCs (adjust_part_quantity's
-- WO-scoped 3-arg overload, and adjust_product_item_quantity) also walk
-- cost_layers in receivedAt order and consume from the oldest layer(s) first
-- on a negative delta, and append a new same-day layer at the part/product's
-- current unit_cost on a positive delta (a return/restore) so quantity_on_hand
-- and sum(cost_layers[].quantity) never drift apart.
--
-- Deliberately NOT touching the other adjust_part_quantity overload
-- (p_org_id, p_part_id, p_delta, p_po_number — 20260806203653) which is for
-- correcting an already-recorded Goods Receipt's quantity; that migration's
-- own comment already documents cost_layers/unit_cost as out of scope there
-- (retroactively re-deriving cost history for a receiving correction is a
-- separate, higher-risk change).

create or replace function public.decrement_cost_layers(p_layers jsonb, p_qty numeric)
returns jsonb
language plpgsql
as $$
declare
  v_remaining numeric := coalesce(p_qty, 0);
  v_layers    jsonb[]  := array(select jsonb_array_elements(coalesce(p_layers, '[]'::jsonb)));
  v_idx       int;
  v_layer     jsonb;
  v_layer_qty numeric;
  v_take      numeric;
  v_result    jsonb;
  rec         record;
begin
  if p_layers is null or jsonb_typeof(p_layers) <> 'array' or v_remaining <= 0 then
    return coalesce(p_layers, '[]'::jsonb);
  end if;

  for rec in
    select ord::int as idx
    from unnest(v_layers) with ordinality as u(elem, ord)
    order by (u.elem->>'receivedAt')::timestamptz asc nulls last
  loop
    exit when v_remaining <= 0;
    v_idx := rec.idx;
    v_layer := v_layers[v_idx];
    v_layer_qty := coalesce((v_layer->>'quantity')::numeric, 0);
    if v_layer_qty > 0 then
      v_take := least(v_layer_qty, v_remaining);
      v_layers[v_idx] := jsonb_set(v_layer, '{quantity}', to_jsonb(v_layer_qty - v_take));
      v_remaining := v_remaining - v_take;
    end if;
  end loop;

  select jsonb_agg(u.elem order by u.ord) into v_result
    from unnest(v_layers) with ordinality as u(elem, ord);

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

create or replace function public.append_cost_layer(p_layers jsonb, p_qty numeric, p_unit_cost numeric)
returns jsonb
language plpgsql
as $$
begin
  if p_qty is null or p_qty <= 0 then
    return coalesce(p_layers, '[]'::jsonb);
  end if;

  return coalesce(p_layers, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'id', 'layer-' || extract(epoch from clock_timestamp())::text || '-' || substr(gen_random_uuid()::text, 1, 8),
    'quantity', p_qty,
    'unitCost', p_unit_cost,
    'receivedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  ));
end;
$$;

drop function if exists public.adjust_part_quantity(uuid, integer, uuid);

create or replace function public.adjust_part_quantity(
  p_part_id         uuid,
  p_delta           integer,
  p_work_order_id   uuid default null
)
returns table(old_qty integer, new_qty integer, applied_delta integer)
language plpgsql
security definer
set search_path = public
as $$
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

  select quantity_on_hand, name, org_id, unit_cost, cost_layers
    into v_old_qty, v_part_name, v_org_id, v_unit_cost, v_cost_layers
    from public.parts
    where id = p_part_id and deleted_at is null
    for update;
  if not found then
    return; -- preserve prior no-op behavior for a missing/deleted part
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
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
    v_cost_layers := public.append_cost_layer(v_cost_layers, v_applied, v_unit_cost);
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
$$;

create or replace function public.adjust_product_item_quantity(
  p_org_id     uuid,
  p_product_id uuid,
  p_delta      numeric,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id      uuid;
  v_user_name    text;
  v_old_qty      numeric;
  v_new_qty      numeric;
  v_product_name text;
  v_unit_cost    numeric;
  v_cost_layers  jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null or p_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  if p_delta = 0 then
    return;
  end if;

  select name into v_user_name
    from public.profiles
    where id = v_user_id
    limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  select quantity_on_hand, name, unit_cost, cost_layers
    into v_old_qty, v_product_name, v_unit_cost, v_cost_layers
    from public.product_items
    where id = p_product_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Product not found';
  end if;
  v_new_qty := v_old_qty + p_delta;

  if v_new_qty < 0 then
    raise exception 'Adjustment would make % quantity on hand negative (% + % = %)', v_product_name, v_old_qty, p_delta, v_new_qty;
  end if;

  if p_delta < 0 then
    v_cost_layers := public.decrement_cost_layers(v_cost_layers, abs(p_delta));
  else
    v_cost_layers := public.append_cost_layer(v_cost_layers, p_delta, v_unit_cost);
  end if;

  update public.product_items
  set quantity_on_hand = v_new_qty,
      cost_layers = v_cost_layers
  where id = p_product_id and org_id = p_org_id;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    p_org_id, v_user_id, 'product_item', p_product_id, 'qty_adjusted',
    v_user_name,
    v_product_name || ': ' || coalesce(p_reason, 'quantity adjustment') || ' '
      || (case when p_delta > 0 then '+' else '' end) || p_delta,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
end;
$$;
