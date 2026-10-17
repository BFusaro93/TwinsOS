-- Net work-order usage recorded before stock arrived against the receipt.
--
-- Adding a part to a Work Order deducts from quantity_on_hand, clamped at 0.
-- When the WO is created before the PO is received (pre-emptive usage, or a
-- receipt entered late) the deduction was silently short, the shortfall was
-- forgotten, and the later receipt then added the full quantity — leaving
-- on-hand overstated by exactly the units already used. Example: Stihl
-- Chainsaw Clutch Shoe 1129 162 0800, WO-2026-915222 (used 3 on 6/23, receipt
-- of 3 recorded 6/29, on-hand shows 3 instead of 0).
--
-- wo_parts.quantity_deducted < quantity already records the shortfall for
-- any line written since 20260926170000. receive_part_quantity now settles
-- those lines after adding the receipt, through set_wo_part_stock (so cost
-- layers, the part audit trail and the line's quantity_deducted all stay
-- consistent; each settled line gets its normal "used N on WO-…" part audit
-- entry from adjust_part_quantity). Body is the 20260930150000 definition with only the settle
-- block and its two declarations added. Signature unchanged.
-- The client additionally re-mirrors parts.quantity_on_hand to the linked
-- product after a part receipt (ReceiveGoodsDialog).

CREATE OR REPLACE FUNCTION public.receive_part_quantity(p_org_id uuid, p_part_id uuid, p_quantity integer, p_layer_unit_cost integer, p_received_at text, p_po_number text, p_cost_method text, p_po_line_item_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_po_status       text;
  v_short           record;
  v_settle          record;
begin
  v_user_id := auth.uid();

  if v_user_id is null or public._equipt_org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_quantity <= 0 then
    raise exception 'Received quantity must be positive';
  end if;

  if p_po_line_item_id is null then
    raise exception 'A PO line item is required to receive stock — use a manual adjustment instead';
  end if;

  select name into v_user_name
    from public.profiles
    where id = v_user_id
    limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  select li.quantity, po.status into v_line_ordered, v_po_status
    from public.po_line_items li
    join public.purchase_orders po on po.id = li.po_id
    where li.id = p_po_line_item_id and li.org_id = p_org_id
      and po.org_id = p_org_id and po.deleted_at is null
    for update of li;
  if not found then
    raise exception 'PO line item not found';
  end if;
  if v_po_status not in ('ordered', 'partially_fulfilled') then
    raise exception 'This PO is % — only ordered or partially fulfilled POs can be received', replace(v_po_status, '_', ' ');
  end if;

  -- Join the header so lines of soft-deleted receipts don't count toward
  -- the cumulative total (they were never physically received).
  select coalesce(sum(grl.quantity_received), 0) into v_line_received
    from public.goods_receipt_lines grl
    join public.goods_receipts gr on gr.id = grl.receipt_id
    where grl.po_line_item_id = p_po_line_item_id
      and gr.deleted_at is null;
  if v_line_received < p_quantity then
    raise exception 'No goods receipt records % of this line (% recorded) — record the receipt first', p_quantity, v_line_received;
  end if;
  if v_line_received > v_line_ordered then
    raise exception 'Cannot receive % more of this line — % already recorded against % ordered. Reduce the quantity or check for a duplicate submission.',
      p_quantity, v_line_received, v_line_ordered;
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

  -- Settle work-order usage recorded while stock was short. A WO line added
  -- before the PO was received could only take what was on hand (deductions
  -- clamp at 0), so the shortfall stays on wo_parts.quantity_deducted <
  -- quantity. Those units were physically used, so they come straight back
  -- off the incoming stock — oldest line first, never below 0, cost layers
  -- consumed FIFO by adjust_part_quantity. Legacy lines (quantity_deducted
  -- NULL) are "assumed fully deducted" and are deliberately not touched.
  for v_short in
    select wp.id, wp.quantity
      from public.wo_parts wp
      join public.work_orders wo on wo.id = wp.work_order_id
      where wp.part_id = p_part_id
        and wp.org_id = p_org_id
        and wp.deleted_at is null
        and wo.deleted_at is null
        and wo.status <> 'skipped'
        and wp.quantity_deducted is not null
        and wp.quantity_deducted < wp.quantity
      order by wp.created_at, wp.id
      for update of wp
  loop
    exit when v_new_qty <= 0;
    select * into v_settle from public.set_wo_part_stock(v_short.id, v_short.quantity);
    if v_settle.applied_delta is not null and v_settle.applied_delta < 0 then
      v_new_qty := v_new_qty + v_settle.applied_delta;
    end if;
  end loop;

end;
$function$;
