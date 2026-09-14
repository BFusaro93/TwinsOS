-- Bug: goods receiving has no server-side cap on cumulative received
-- quantity vs. what was ordered. ReceiveGoodsDialog.tsx computes
-- `alreadyReceivedMap` from a client-fetched snapshot of goods_receipts and
-- only uses it to clamp the quantity <input>'s `max` attribute — that's a UX
-- hint, not a guard. receive_part_quantity()/receive_product_cost_layer()
-- (the RPCs that actually append a cost layer and bump quantity_on_hand)
-- never look at the PO line item's ordered quantity at all, so two
-- concurrent submissions against the same PO line item (e.g. two staff
-- racing to record the same delivery, or a double-click that gets past the
-- dialog's own disabled-while-submitting guard) can each pass the stale
-- client-side check and both succeed, over-receiving the line.
--
-- Fix: give both RPCs an optional `p_po_line_item_id` parameter. When
-- passed, the function locks that po_line_items row (serializing concurrent
-- receipts against the same line) and rejects the call if the cumulative
-- quantity_received recorded in goods_receipt_lines for that line —
-- INCLUDING the just-inserted row for this very receipt, since
-- ReceiveGoodsDialog always creates the goods_receipts/goods_receipt_lines
-- header+lines first and only calls these RPCs afterward to apply
-- inventory — would exceed po_line_items.quantity. The parameter defaults
-- to null (skip the check) so any other caller/signature use keeps its
-- existing behavior unchanged.

create or replace function public.receive_part_quantity(
  p_org_id uuid,
  p_part_id uuid,
  p_quantity integer,
  p_layer_unit_cost integer,
  p_received_at text,
  p_po_number text,
  p_cost_method text,
  p_po_line_item_id uuid default null
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
  v_line_ordered    numeric;
  v_line_received   numeric;
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

  -- Lock the PO line item (if given) BEFORE reading the cumulative received
  -- total, so a second concurrent call for the same line blocks here until
  -- the first one commits its goods_receipt_lines row, instead of both
  -- computing the sum from a pre-receipt snapshot and both passing.
  if p_po_line_item_id is not null then
    select quantity into v_line_ordered
      from public.po_line_items
      where id = p_po_line_item_id and org_id = p_org_id
      for update;
    if found then
      select coalesce(sum(quantity_received), 0) into v_line_received
        from public.goods_receipt_lines
        where po_line_item_id = p_po_line_item_id;
      if v_line_received > v_line_ordered then
        raise exception 'Cannot receive % more of this line — % already recorded against % ordered. Reduce the quantity or check for a duplicate submission.',
          p_quantity, v_line_received, v_line_ordered;
      end if;
    end if;
  end if;

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
  p_cost_method text,
  p_po_line_item_id uuid default null
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
  v_line_ordered      numeric;
  v_line_received     numeric;
begin
  if p_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  -- Same lock-then-check pattern as receive_part_quantity above: locking the
  -- PO line item serializes concurrent receipts of the same line so the
  -- cumulative check below can't be raced.
  if p_po_line_item_id is not null then
    select quantity into v_line_ordered
      from public.po_line_items
      where id = p_po_line_item_id and org_id = p_org_id
      for update;
    if found then
      select coalesce(sum(quantity_received), 0) into v_line_received
        from public.goods_receipt_lines
        where po_line_item_id = p_po_line_item_id;
      if v_line_received > v_line_ordered then
        raise exception 'Cannot receive % more of this line — % already recorded against % ordered. Reduce the quantity or check for a duplicate submission.',
          p_layer_quantity, v_line_received, v_line_ordered;
      end if;
    end if;
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
