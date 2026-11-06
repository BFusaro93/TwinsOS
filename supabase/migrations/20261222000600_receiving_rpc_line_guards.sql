-- Goods-receiving RPC hardening.
--
-- receive_part_quantity / receive_product_receipt only checked that the receipts
-- recorded against a PO line, summed, covered THIS call's quantity and stayed within
-- what was ordered. So:
--   * calling either twice for the same receipt line doubled stock (nothing recorded
--     what had already been applied);
--   * p_part_id / p_product_id were trusted — a mulch line could be received into an
--     expensive part;
--   * project-assigned lines and untracked products (which the dialog deliberately
--     keeps out of stock) were accepted;
--   * the layer unit cost was whatever the caller sent, skewing cost layers / WAC.
--
-- Now each goods_receipt_lines row records how much of it has been applied to parts
-- and to product stock (part_qty_applied / product_qty_applied). Only these RPCs may
-- raise them (app.receiving_rpc GUC); any other write keeps them in step with
-- quantity_received when the line was fully applied (receipt edits, which move stock
-- through correct_*_receipt). The part/product must be the line's own, project and
-- untracked lines are refused, and the unit cost comes from the PO line.
--
-- receive_part_quantity also returns the work-order shortfalls it settled
-- ({"settled":[{"wo_part_id":…,"previous_deducted":…}]}) so a failed multi-line
-- receipt can reopen them when it rolls back (ReceiveGoodsDialog). The return type
-- changes (void → jsonb), so the function is dropped and recreated with its grants.
-- Bodies start from the live definitions (20261019000000 / 20260930150000) with every
-- existing guard kept.

alter table public.goods_receipt_lines
  add column if not exists part_qty_applied numeric not null default 0,
  add column if not exists product_qty_applied numeric not null default 0;

-- Every existing receipt line was applied when it was recorded (project / untracked
-- lines never call these RPCs, and they're now refused anyway).
update public.goods_receipt_lines
   set part_qty_applied = quantity_received,
       product_qty_applied = quantity_received
 where part_qty_applied = 0 and product_qty_applied = 0 and quantity_received > 0;

create or replace function public.goods_receipt_lines_guard_applied()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_setting('app.receiving_rpc', true) is not distinct from 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.part_qty_applied := 0;
    new.product_qty_applied := 0;
    return new;
  end if;
  -- A receipt edit moves stock with correct_*_receipt; keep a fully applied line
  -- fully applied, and never let a client raise or reset the counters.
  new.part_qty_applied := case
    when old.part_qty_applied >= old.quantity_received - 0.0005 then new.quantity_received
    else least(old.part_qty_applied, new.quantity_received) end;
  new.product_qty_applied := case
    when old.product_qty_applied >= old.quantity_received - 0.0005 then new.quantity_received
    else least(old.product_qty_applied, new.quantity_received) end;
  return new;
end;
$$;

drop trigger if exists goods_receipt_lines_guard_applied on public.goods_receipt_lines;
create trigger goods_receipt_lines_guard_applied
  before insert or update on public.goods_receipt_lines
  for each row execute function public.goods_receipt_lines_guard_applied();

-- Shared: checks and records applying p_qty of a PO line to stock ('part' | 'product').
create or replace function public._receiving_claim_line(p_po_line_item_id uuid, p_qty numeric, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received numeric;
  v_applied  numeric;
  v_left     numeric := p_qty;
  v_line     record;
  v_take     numeric;
begin
  select coalesce(sum(grl.quantity_received), 0),
         coalesce(sum(case when p_kind = 'part' then grl.part_qty_applied else grl.product_qty_applied end), 0)
    into v_received, v_applied
    from public.goods_receipt_lines grl
    join public.goods_receipts gr on gr.id = grl.receipt_id
   where grl.po_line_item_id = p_po_line_item_id
     and gr.deleted_at is null;
  if v_applied + p_qty > v_received + 0.0005 then
    raise exception 'This receipt has already been added to stock (% of % recorded already applied) — check for a duplicate submission.',
      v_applied, v_received using errcode = 'P0001';
  end if;

  perform set_config('app.receiving_rpc', 'on', true);
  for v_line in
    select grl.id, grl.quantity_received,
           case when p_kind = 'part' then grl.part_qty_applied else grl.product_qty_applied end as applied
      from public.goods_receipt_lines grl
      join public.goods_receipts gr on gr.id = grl.receipt_id
     where grl.po_line_item_id = p_po_line_item_id
       and gr.deleted_at is null
       and grl.quantity_received > case when p_kind = 'part' then grl.part_qty_applied else grl.product_qty_applied end
     order by grl.created_at desc, grl.id desc
     for update of grl
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_line.quantity_received - v_line.applied);
    if p_kind = 'part' then
      update public.goods_receipt_lines set part_qty_applied = part_qty_applied + v_take where id = v_line.id;
    else
      update public.goods_receipt_lines set product_qty_applied = product_qty_applied + v_take where id = v_line.id;
    end if;
    v_left := v_left - v_take;
  end loop;
  perform set_config('app.receiving_rpc', '', true);
end;
$$;
revoke all on function public._receiving_claim_line(uuid, numeric, text) from public, anon, authenticated;

drop function if exists public.receive_part_quantity(uuid, uuid, integer, integer, text, text, text, uuid);
create function public.receive_part_quantity(p_org_id uuid, p_part_id uuid, p_quantity integer, p_layer_unit_cost integer, p_received_at text, p_po_number text, p_cost_method text, p_po_line_item_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
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
  v_part_number text;
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
  v_line            record;
  v_unit_cost       integer;
  v_short           record;
  v_settle          record;
  v_settled         jsonb := '[]'::jsonb;
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

  select li.quantity, po.status, li.part_id, li.product_item_id, li.product_item_name, li.part_number, li.project_id, li.unit_cost
    into v_line
    from public.po_line_items li
    join public.purchase_orders po on po.id = li.po_id
    where li.id = p_po_line_item_id and li.org_id = p_org_id
      and po.org_id = p_org_id and po.deleted_at is null
    for update of li;
  if not found then
    raise exception 'PO line item not found';
  end if;
  v_line_ordered := v_line.quantity;
  v_po_status := v_line.status;
  if v_po_status not in ('ordered', 'partially_fulfilled') then
    raise exception 'This PO is % — only ordered or partially fulfilled POs can be received', replace(v_po_status, '_', ' ');
  end if;
  if v_line.project_id is not null then
    raise exception 'This line is assigned to a project — project materials are not added to stock';
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

  select quantity_on_hand, unit_cost, name, product_item_id, part_number, coalesce(cost_layers, '[]'::jsonb)
    into v_old_qty, v_old_cost, v_part_name, v_product_item_id, v_part_number, v_current_layers
    from public.parts
    where id = p_part_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Part not found';
  end if;

  -- The part must be this line's: its own part, the part linked to the line's
  -- product, or (legacy lines with no ids) the same part number or product name.
  if not (
       (v_line.part_id is not null and v_line.part_id = p_part_id)
    or (v_line.part_id is null and v_line.product_item_id is not null and v_product_item_id = v_line.product_item_id)
    or (v_line.part_id is null and nullif(btrim(v_line.part_number), '') is not null
        and lower(btrim(v_part_number)) = lower(btrim(v_line.part_number)))
    or (v_line.part_id is null and v_line.product_item_id is null and v_product_item_id is not null
        and exists (select 1 from public.product_items pi
                     where pi.id = v_product_item_id and pi.org_id = p_org_id
                       and lower(btrim(pi.name)) = lower(btrim(v_line.product_item_name))))
  ) then
    raise exception 'That part is not the one on this PO line';
  end if;

  perform public._receiving_claim_line(p_po_line_item_id, p_quantity, 'part');

  -- Unit cost comes from the PO line (whole cents, as the client used to round it).
  v_unit_cost := round(coalesce(v_line.unit_cost, p_layer_unit_cost))::integer;

  v_new_qty := v_old_qty + p_quantity;

  v_new_layer := jsonb_build_object(
    'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
    'quantity', p_quantity,
    'unitCost', v_unit_cost,
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
    v_new_unit_cost := v_unit_cost;
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

  -- Settle work-order usage recorded while stock was short (20261019000000). Each
  -- settled line is returned with its previous quantity_deducted so a caller that
  -- rolls the receipt back can reopen it (set_wo_part_stock(id, previous_deducted)).
  for v_short in
    select wp.id, wp.quantity, wp.quantity_deducted
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
      v_settled := v_settled || jsonb_build_array(jsonb_build_object(
        'wo_part_id', v_short.id, 'previous_deducted', v_short.quantity_deducted));
    end if;
  end loop;

  return jsonb_build_object('settled', v_settled);
end;
$function$;
revoke all on function public.receive_part_quantity(uuid, uuid, integer, integer, text, text, text, uuid) from public, anon;
grant execute on function public.receive_part_quantity(uuid, uuid, integer, integer, text, text, text, uuid) to authenticated, service_role;

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
  v_product_number    text;
  v_category          text;
  v_is_inventory      boolean;
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
  v_line              record;
  v_unit_cost         integer;
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

  select li.quantity, po.status, li.product_item_id, li.product_item_name, li.part_number, li.project_id, li.unit_cost
    into v_line
    from public.po_line_items li
    join public.purchase_orders po on po.id = li.po_id
    where li.id = p_po_line_item_id and li.org_id = p_org_id
      and po.org_id = p_org_id and po.deleted_at is null
    for update of li;
  if not found then
    raise exception 'PO line item not found';
  end if;
  v_line_ordered := v_line.quantity;
  v_po_status := v_line.status;
  if v_po_status not in ('ordered', 'partially_fulfilled') then
    raise exception 'This PO is % — only ordered or partially fulfilled POs can be received', replace(v_po_status, '_', ' ');
  end if;
  if v_line.project_id is not null then
    raise exception 'This line is assigned to a project — project materials are not added to stock';
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

  select coalesce(cost_layers, '[]'::jsonb), unit_cost, quantity_on_hand, name, part_number, category, is_inventory
    into v_current_layers, v_current_unit_cost, v_old_qty, v_product_name, v_product_number, v_category, v_is_inventory
    from public.product_items
    where id = p_product_id and org_id = p_org_id and deleted_at is null
    for update;

  if not found then
    raise exception 'Product not found';
  end if;

  -- The product must be this line's: its catalog product, or (legacy lines with no
  -- product id) the same part number / name the dialog matches on.
  if not (
       (v_line.product_item_id is not null and v_line.product_item_id = p_product_id)
    or (v_line.product_item_id is null and (
          (nullif(btrim(v_line.part_number), '') is not null and lower(btrim(v_product_number)) = lower(btrim(v_line.part_number)))
       or (nullif(btrim(v_line.product_item_name), '') is not null and lower(btrim(v_product_name)) = lower(btrim(v_line.product_item_name)))))
  ) then
    raise exception 'That product is not the one on this PO line';
  end if;
  if v_category is distinct from 'maintenance_part' and v_is_inventory is not true then
    raise exception '% has Track inventory off — it is not added to stock', v_product_name;
  end if;

  perform public._receiving_claim_line(p_po_line_item_id, p_layer_quantity, 'product');

  v_unit_cost := round(coalesce(v_line.unit_cost, p_layer_unit_cost))::integer;

  v_old_qty := coalesce(v_old_qty, 0);
  v_new_qty := v_old_qty + p_layer_quantity;

  v_new_layer := jsonb_build_object(
    'id', 'layer-' || floor(extract(epoch from clock_timestamp()) * 1000)::text || '-' || substr(md5(random()::text), 1, 6),
    'quantity', p_layer_quantity,
    'unitCost', v_unit_cost,
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
    v_new_unit_cost := v_unit_cost;
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
