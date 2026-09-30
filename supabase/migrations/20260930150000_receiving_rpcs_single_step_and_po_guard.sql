-- Goods-receiving RPC fixes.
--
-- SAFE TO APPLY BEFORE THE DEPLOY: every change works with both the deployed
-- (origin/main) client and the new one.
--
-- 1. Double cost layers on product receipts. The deployed client calls
--    receive_product_cost_layer (appends a layer of Q) and THEN
--    adjust_product_item_quantity(+Q), which since 20260827200000 also appends
--    a layer for every positive delta — so each receipt writes 2×Q of layers
--    against Q on hand, skewing WAC and FIFO.
--    receive_product_cost_layer keeps its layer-only semantics (no quantity
--    change) so that deployed client can't double-increment in the window
--    between this migration and the deploy. The NEW RPC
--    receive_product_receipt does layer + quantity_on_hand + one attributed
--    audit row under one row lock; the new client calls it and drops the
--    adjust call. receive_product_cost_layer has no caller after the deploy
--    and can be dropped in a later migration.
--
-- 2. receive_part_quantity / receive_product_cost_layer / receive_product_
--    receipt accepted (or would accept) p_po_line_item_id NULL and never
--    looked at the PO, so any Equipt writer could mint stock + cost layers
--    outside a goods receipt. All now require:
--      * p_po_line_item_id NOT NULL, the line in p_org_id;
--      * its PO live, in p_org_id, status 'ordered' or 'partially_fulfilled';
--      * live goods_receipt_lines for the line (receipt not soft-deleted)
--        totalling at least the quantity being applied, and (existing guard)
--        no more than was ordered.
--    The only callers are ReceiveGoodsDialog (via useReceivePartCostLayer /
--    useReceiveProductCostLayer) in both the deployed and new client: it only
--    opens for ordered / partially fulfilled POs (PODetailPanel), inserts the
--    goods receipt + lines first, always passes the line id, and moves the PO
--    status only after every inventory RPC has returned. Manual stock moves use
--    adjust_part_quantity_manual / adjust_product_item_quantity; receipt
--    corrections use correct_part_receipt / correct_product_receipt (below).
--
-- 3. correct_product_receipt: the product-side twin of correct_part_receipt, so
--    the new ReceiveGoodsDialog rollback removes the units (and quantity) that
--    receive_product_receipt just added from this PO's layer instead of
--    FIFO-consuming the oldest layers. New function — the deployed client
--    doesn't call it.
--
-- Bodies start from the latest definitions (20260929130000, repointed to
-- _equipt_org_mismatch by 20260929140000) with every guard kept. Existing
-- signatures are unchanged, so CREATE OR REPLACE replaces in place.

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
end;
$function$;

-- Legacy layer-only RPC, kept with its origin/main semantics (cost layer +
-- WAC/FIFO unit cost; quantity_on_hand NOT touched) so the deployed client —
-- which follows it with adjust_product_item_quantity(+Q) — keeps working
-- without a double increment while this migration lands ahead of the deploy.
-- Gains the same PO-status / receipt-line checks as receive_part_quantity; the
-- old client always passes p_po_line_item_id after inserting the receipt, and
-- only opens receiving for ordered / partially fulfilled POs.
-- The new client calls receive_product_receipt (below) instead.
CREATE OR REPLACE FUNCTION public.receive_product_cost_layer(p_org_id uuid, p_product_id uuid, p_layer_quantity numeric, p_layer_unit_cost integer, p_received_at text, p_po_number text, p_cost_method text, p_po_line_item_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(new_unit_cost integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_po_status         text;
begin
  if public._equipt_org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_layer_quantity is null or p_layer_quantity <= 0 then
    raise exception 'Received quantity must be positive';
  end if;

  if p_po_line_item_id is null then
    raise exception 'A PO line item is required to receive stock — use a manual adjustment instead';
  end if;

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

  select coalesce(sum(grl.quantity_received), 0) into v_line_received
    from public.goods_receipt_lines grl
    join public.goods_receipts gr on gr.id = grl.receipt_id
    where grl.po_line_item_id = p_po_line_item_id
      and gr.deleted_at is null;
  if v_line_received < p_layer_quantity then
    raise exception 'No goods receipt records % of this line (% recorded) — record the receipt first', p_layer_quantity, v_line_received;
  end if;
  if v_line_received > v_line_ordered then
    raise exception 'Cannot receive % more of this line — % already recorded against % ordered. Reduce the quantity or check for a duplicate submission.',
      p_layer_quantity, v_line_received, v_line_ordered;
  end if;

  select coalesce(cost_layers, '[]'::jsonb), unit_cost
    into v_current_layers, v_current_unit_cost
    from public.product_items
    where id = p_product_id and org_id = p_org_id and deleted_at is null
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
$function$;

-- Single-step product receipt for the new client: cost layer + quantity_on_hand
-- + WAC/FIFO unit cost + one attributed audit row, under one row lock. Do NOT
-- follow it with adjust_product_item_quantity (which appends its own layer).
CREATE OR REPLACE FUNCTION public.receive_product_receipt(p_org_id uuid, p_product_id uuid, p_layer_quantity numeric, p_layer_unit_cost integer, p_received_at text, p_po_number text, p_cost_method text, p_po_line_item_id uuid)
 RETURNS TABLE(new_unit_cost integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id           uuid := auth.uid();
  v_user_name         text;
  v_product_name      text;
  v_old_qty           numeric;
  v_new_qty           numeric;
  v_current_layers    jsonb;
  v_current_unit_cost integer;
  v_new_layer         jsonb;
  v_new_layers        jsonb;
  v_total_qty         numeric;
  v_total_value       numeric;
  v_new_unit_cost     integer;
  v_line_ordered      numeric;
  v_line_received     numeric;
  v_po_status         text;
  v_description       text;
begin
  if public._equipt_org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_layer_quantity is null or p_layer_quantity <= 0 then
    raise exception 'Received quantity must be positive';
  end if;

  if p_po_line_item_id is null then
    raise exception 'A PO line item is required to receive stock — use a manual adjustment instead';
  end if;

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
  if v_line_received < p_layer_quantity then
    raise exception 'No goods receipt records % of this line (% recorded) — record the receipt first', p_layer_quantity, v_line_received;
  end if;
  if v_line_received > v_line_ordered then
    raise exception 'Cannot receive % more of this line — % already recorded against % ordered. Reduce the quantity or check for a duplicate submission.',
      p_layer_quantity, v_line_received, v_line_ordered;
  end if;

  select coalesce(cost_layers, '[]'::jsonb), unit_cost, quantity_on_hand, name
    into v_current_layers, v_current_unit_cost, v_old_qty, v_product_name
    from public.product_items
    where id = p_product_id and org_id = p_org_id and deleted_at is null
    for update;

  if not found then
    raise exception 'Product not found';
  end if;

  v_old_qty := coalesce(v_old_qty, 0);
  v_new_qty := v_old_qty + p_layer_quantity;

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

  -- The attributed 'received' row below replaces fn_audit_log's generic
  -- qty_adjusted row (same suppression the parts RPCs use).
  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.product_items
  set cost_layers      = v_new_layers,
      unit_cost        = v_new_unit_cost,
      quantity_on_hand = v_new_qty
  where id = p_product_id and org_id = p_org_id;

  select name into v_user_name from public.profiles where id = v_user_id limit 1;
  v_description := v_product_name || ': received via PO ' ||
    coalesce(nullif(p_po_number, ''), '(unknown)') || ' +' || p_layer_quantity;
  if v_new_unit_cost is distinct from v_current_unit_cost then
    v_description := v_description || ' (unit cost $' ||
      round(v_current_unit_cost::numeric / 100, 2) || ' → $' || round(v_new_unit_cost::numeric / 100, 2) || ')';
  end if;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    p_org_id, v_user_id, 'product', p_product_id, 'received',
    coalesce(v_user_name, 'System'), v_description,
    'quantity_on_hand', v_old_qty::text, v_new_qty::text
  );

  return query select v_new_unit_cost;
end;
$function$;

-- Re-state execute grants (matches 20260913160000: no anon/public execute).
revoke all on function public.receive_part_quantity(uuid, uuid, integer, integer, text, text, text, uuid) from public, anon;
grant execute on function public.receive_part_quantity(uuid, uuid, integer, integer, text, text, text, uuid) to authenticated, service_role;
revoke all on function public.receive_product_cost_layer(uuid, uuid, numeric, integer, text, text, text, uuid) from public, anon;
grant execute on function public.receive_product_cost_layer(uuid, uuid, numeric, integer, text, text, text, uuid) to authenticated, service_role;
revoke all on function public.receive_product_receipt(uuid, uuid, numeric, integer, text, text, text, uuid) from public, anon;
grant execute on function public.receive_product_receipt(uuid, uuid, numeric, integer, text, text, text, uuid) to authenticated, service_role;

-- ── correct_product_receipt ──────────────────────────────────────────────
-- Product-side twin of correct_part_receipt (20260926170100):
--   delta > 0  adds a cost layer for the extra units at p_unit_cost.
--   delta < 0  removes up to |delta| units, clamped to what is on hand;
--              taken from this PO's layers first (newest first), any
--              remainder FIFO from other layers. Never raises on shortfall.
-- Under WAC the unit cost is re-averaged from the remaining layers.
create or replace function public.correct_product_receipt(
  p_org_id     uuid,
  p_product_id uuid,
  p_delta      numeric,
  p_unit_cost  integer,
  p_po_number  text
)
returns table(old_qty numeric, new_qty numeric, requested_delta numeric, applied_delta numeric)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_user_id     uuid := auth.uid();
  v_user_name   text;
  v_old_qty     numeric;
  v_new_qty     numeric;
  v_old_cost    integer;
  v_new_cost    integer;
  v_name        text;
  v_layers      jsonb[];
  v_result      jsonb;
  v_take        numeric;
  v_remaining   numeric;
  v_layer_qty   numeric;
  v_step        numeric;
  v_cost_method text;
  v_total_qty   numeric;
  v_total_value numeric;
  v_applied     numeric;
  i             int;
begin
  if v_user_id is null or public._equipt_org_mismatch(p_org_id) then
    raise exception 'Unauthorized';
  end if;

  select coalesce(quantity_on_hand, 0), unit_cost, name,
         array(select jsonb_array_elements(coalesce(cost_layers, '[]'::jsonb)))
    into v_old_qty, v_old_cost, v_name, v_layers
    from public.product_items
    where id = p_product_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Product not found';
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

  update public.product_items
    set quantity_on_hand = v_new_qty,
        cost_layers      = v_result,
        unit_cost        = v_new_cost
    where id = p_product_id and org_id = p_org_id;

  if v_applied <> 0 then
    select name into v_user_name from public.profiles where id = v_user_id limit 1;
    insert into public.audit_log (
      org_id, created_by, record_type, record_id, action,
      changed_by_name, description, field_changed, old_value, new_value
    ) values (
      p_org_id, v_user_id, 'product', p_product_id, 'received',
      coalesce(v_user_name, 'System'),
      v_name || ': receipt correction ' || (case when v_applied > 0 then '+' else '' end) || v_applied
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

revoke all on function public.correct_product_receipt(uuid, uuid, numeric, integer, text) from public, anon;
grant execute on function public.correct_product_receipt(uuid, uuid, numeric, integer, text) to authenticated;
