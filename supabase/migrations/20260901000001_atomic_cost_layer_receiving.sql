-- Both goods-receipt cost-layer paths computed the new cost_layers array and
-- resulting unit_cost in JS from a plain SELECT, taken BEFORE any row lock,
-- then wrote the precomputed values back:
--   - parts:         receive_part_quantity(p_new_unit_cost, p_new_cost_layers)
--                     took the caller's precomputed values and wrote them
--                     verbatim under a `for update` lock acquired only AFTER
--                     the JS computation already ran — the lock protected
--                     quantity_on_hand's arithmetic (done inside the
--                     function) but not cost_layers/unit_cost, which were
--                     just overwritten with whatever the caller had already
--                     decided, based on a read that could already be stale.
--   - product_items:  useReceiveProductCostLayer() never went through an
--                     RPC at all — plain read, JS append/recompute, plain
--                     update.
-- Two concurrent receipts against the same part/product (two staff
-- receiving different POs for the same item same day) race: the second
-- writer's JS read predates the first writer's insert, so one cost layer is
-- silently dropped even though quantity_on_hand (already routed through an
-- atomic RPC) correctly reflects both receipts — cost_layers and
-- quantity_on_hand diverge, corrupting FIFO/WAC costing and any COGS math
-- derived from it.
--
-- Fix: move the append + WAC/FIFO recompute inside each RPC, under the same
-- row lock used for the quantity update, so concurrent callers serialize
-- instead of racing on stale reads.

create or replace function public.receive_part_quantity(
  p_org_id uuid,
  p_part_id uuid,
  p_quantity integer,
  p_layer_unit_cost integer,
  p_received_at text,
  p_po_number text,
  p_cost_method text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id     uuid;
  v_user_name   text;
  v_old_qty     integer;
  v_new_qty     integer;
  v_old_cost    integer;
  v_part_name   text;
  v_description text;
  v_product_item_id uuid;
  v_current_layers  jsonb;
  v_new_layer       jsonb;
  v_new_layers      jsonb;
  v_total_qty       numeric;
  v_total_value     numeric;
  v_new_unit_cost   integer;
begin
  v_user_id := auth.uid();

  if v_user_id is null or p_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  if p_quantity <= 0 then
    raise exception 'Received quantity must be positive';
  end if;

  select name into v_user_name
    from public.profiles
    where id = v_user_id
    limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  select quantity_on_hand, unit_cost, name, product_item_id, coalesce(cost_layers, '[]'::jsonb)
    into v_old_qty, v_old_cost, v_part_name, v_product_item_id, v_current_layers
    from public.parts
    where id = p_part_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Part not found';
  end if;
  v_new_qty := v_old_qty + p_quantity;

  v_new_layer := jsonb_build_object(
    'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
    'quantity', p_quantity,
    'unitCost', p_layer_unit_cost,
    'receivedAt', p_received_at,
    'poNumber', p_po_number
  );
  v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);

  if p_cost_method = 'wac' then
    select coalesce(sum((l->>'quantity')::numeric), 0), coalesce(sum((l->>'quantity')::numeric * (l->>'unitCost')::numeric), 0)
      into v_total_qty, v_total_value
      from jsonb_array_elements(v_new_layers) l
      where (l->>'quantity')::numeric > 0;
    v_new_unit_cost := case when v_total_qty > 0 then round(v_total_value / v_total_qty) else v_old_cost end;
  else
    v_new_unit_cost := round(p_layer_unit_cost);
  end if;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
  set quantity_on_hand = v_new_qty,
      unit_cost         = v_new_unit_cost,
      cost_layers       = v_new_layers
  where id = p_part_id and org_id = p_org_id;

  if v_product_item_id is not null then
    update public.product_items
    set unit_cost = v_new_unit_cost
    where id = v_product_item_id and org_id = p_org_id;
  end if;

  v_description := v_part_name || ': received ' || p_quantity || ' via PO ' ||
    coalesce(nullif(p_po_number, ''), '(unknown)');
  if v_new_unit_cost is distinct from v_old_cost then
    v_description := v_description || ' (unit cost $' ||
      round(v_old_cost::numeric / 100, 2) || ' → $' || round(v_new_unit_cost::numeric / 100, 2) || ')';
  end if;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    p_org_id, v_user_id, 'part', p_part_id, 'received',
    v_user_name, v_description,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );
end;
$function$;

create or replace function public.receive_product_cost_layer(
  p_org_id uuid,
  p_product_id uuid,
  p_layer_quantity numeric,
  p_layer_unit_cost integer,
  p_received_at text,
  p_po_number text,
  p_cost_method text
)
returns table(new_unit_cost integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_layers    jsonb;
  v_current_unit_cost integer;
  v_new_layer         jsonb;
  v_new_layers        jsonb;
  v_total_qty         numeric;
  v_total_value       numeric;
  v_new_unit_cost     integer;
begin
  if p_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  select coalesce(cost_layers, '[]'::jsonb), unit_cost
    into v_current_layers, v_current_unit_cost
    from public.product_items
    where id = p_product_id and org_id = p_org_id
    for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_new_layer := jsonb_build_object(
    'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
    'quantity', p_layer_quantity,
    'unitCost', p_layer_unit_cost,
    'receivedAt', p_received_at,
    'poNumber', p_po_number
  );
  v_new_layers := v_current_layers || jsonb_build_array(v_new_layer);

  if p_cost_method = 'wac' then
    select coalesce(sum((l->>'quantity')::numeric), 0), coalesce(sum((l->>'quantity')::numeric * (l->>'unitCost')::numeric), 0)
      into v_total_qty, v_total_value
      from jsonb_array_elements(v_new_layers) l
      where (l->>'quantity')::numeric > 0;
    v_new_unit_cost := case when v_total_qty > 0 then round(v_total_value / v_total_qty) else v_current_unit_cost end;
  else
    v_new_unit_cost := round(p_layer_unit_cost);
  end if;

  update public.product_items
  set cost_layers = v_new_layers,
      unit_cost = v_new_unit_cost
  where id = p_product_id and org_id = p_org_id;

  return query select v_new_unit_cost;
end;
$$;
