-- Equipt receiving: over-receipt guard, part-before-product rule, and PO
-- status derived from goods receipts.
--
-- 1. goods_receipt_lines: the cumulative quantity_received of a PO line across
--    its live receipts may not exceed the quantity ordered. A double-click or a
--    second tab used to record two receipts for project / untracked lines
--    (which never reach the receiving RPCs that check this). The PO line row is
--    locked so two concurrent receipts serialize.
-- 2. receive_product_receipt refuses a maintenance_part product that has a live
--    linked Parts record unless the part side of the line was received first.
-- 3. purchase_orders.status (ordered / partially_fulfilled / completed) is
--    recomputed from the receipts whenever a receipt line is created, edited,
--    re-linked or deleted, a receipt is (un)deleted, or a PO line's quantity
--    changes — not written from the browser's possibly stale snapshot.
--    Both receiving RPCs therefore also accept a 'completed' PO.

-- ── 1. Over-receipt guard ──────────────────────────────────────────────────
create or replace function public.goods_receipt_lines_guard_over_receipt()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ordered numeric;
  v_other   numeric;
begin
  if NEW.po_line_item_id is null then
    return NEW;
  end if;
  if NEW.quantity_received < 0 then
    raise exception 'Received quantity can''t be negative' using errcode = '22023';
  end if;
  if TG_OP = 'UPDATE'
     and NEW.po_line_item_id is not distinct from OLD.po_line_item_id
     and NEW.quantity_received <= OLD.quantity_received then
    return NEW;
  end if;

  select li.quantity into v_ordered
    from public.po_line_items li
   where li.id = NEW.po_line_item_id
     for update;
  if not found then
    return NEW;
  end if;

  select coalesce(sum(grl.quantity_received), 0) into v_other
    from public.goods_receipt_lines grl
    join public.goods_receipts gr on gr.id = grl.receipt_id and gr.deleted_at is null
   where grl.po_line_item_id = NEW.po_line_item_id
     and grl.id <> NEW.id;

  if v_other + NEW.quantity_received > v_ordered + 0.0005 then
    raise exception '"%": % would be received in total but only % was ordered (% already on other receipts) — check for a duplicate submission.',
      NEW.product_item_name, v_other + NEW.quantity_received, v_ordered, v_other
      using errcode = 'P0001';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_goods_receipt_lines_guard_over_receipt on public.goods_receipt_lines;
create trigger trg_goods_receipt_lines_guard_over_receipt
  before insert or update of quantity_received, po_line_item_id on public.goods_receipt_lines
  for each row execute function public.goods_receipt_lines_guard_over_receipt();

-- ── 2/3. Receiving RPCs (live definitions; status set + part-first rule) ────
CREATE OR REPLACE FUNCTION public.receive_part_quantity(p_org_id uuid, p_part_id uuid, p_quantity integer, p_layer_unit_cost integer, p_received_at text, p_po_number text, p_cost_method text, p_po_line_item_id uuid DEFAULT NULL::uuid)
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
  -- 'completed' too: the PO's status now follows its goods receipts
  -- (po_refresh_receipt_status, 20261229000410), so recording the final
  -- receipt marks the PO completed before its stock is applied.
  if v_po_status not in ('ordered', 'partially_fulfilled', 'completed') then
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
  v_part_applied      numeric;
  v_product_applied   numeric;
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
  -- 'completed' too: the PO's status now follows its goods receipts
  -- (po_refresh_receipt_status, 20261229000410), so recording the final
  -- receipt marks the PO completed before its stock is applied.
  if v_po_status not in ('ordered', 'partially_fulfilled', 'completed') then
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

  -- A maintenance part's stock lives on its Parts record; the product row only
  -- mirrors it. Receiving the product side alone (the receiving screen used to
  -- look the part up in a list capped at 1,000 rows and silently skip it) put
  -- the units on the product, where the next part sync wiped them out. Refuse
  -- unless the part side of this line has already been received.
  if v_category = 'maintenance_part'
     and exists (select 1 from public.parts pt
                  where pt.product_item_id = p_product_id and pt.org_id = p_org_id and pt.deleted_at is null) then
    select coalesce(sum(grl.part_qty_applied), 0), coalesce(sum(grl.product_qty_applied), 0)
      into v_part_applied, v_product_applied
      from public.goods_receipt_lines grl
      join public.goods_receipts gr on gr.id = grl.receipt_id
     where grl.po_line_item_id = p_po_line_item_id
       and gr.deleted_at is null;
    if v_product_applied + p_layer_quantity > v_part_applied + 0.0005 then
      raise exception '% is a maintenance part with a Parts record — receive it into the part first (% of this line received into the part, % into the product).',
        v_product_name, v_part_applied, v_product_applied using errcode = 'P0001';
    end if;
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

-- ── 3. PO status from receipts ─────────────────────────────────────────────
create or replace function public.po_refresh_receipt_status(p_po_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
  v_new    text;
  v_lines  integer;
  v_all    boolean;
  v_any    boolean;
  v_prev   text;
begin
  if p_po_id is null then
    return null;
  end if;
  select status into v_status
    from public.purchase_orders
   where id = p_po_id and deleted_at is null
     for update;
  if not found then
    return null;
  end if;
  -- Only the receiving stage follows the receipts; draft / approval / canceled
  -- POs are never moved by them.
  if v_status not in ('approved', 'ordered', 'partially_fulfilled', 'completed') then
    return v_status;
  end if;

  select count(*),
         coalesce(bool_and(coalesce(r.received, 0) >= li.quantity - 0.0005), false),
         coalesce(bool_or(coalesce(r.received, 0) > 0), false)
    into v_lines, v_all, v_any
    from public.po_line_items li
    left join lateral (
      select sum(grl.quantity_received) as received
        from public.goods_receipt_lines grl
        join public.goods_receipts gr on gr.id = grl.receipt_id and gr.deleted_at is null
       where grl.po_line_item_id = li.id
    ) r on true
   where li.po_id = p_po_id;
  if v_lines = 0 then
    return v_status;
  end if;

  v_new := case
    when v_all then 'completed'
    when v_any then 'partially_fulfilled'
    when v_status in ('partially_fulfilled', 'completed') then 'ordered'
    else v_status
  end;

  if v_new is distinct from v_status then
    -- A receipt-driven move (e.g. completed -> partially_fulfilled after a
    -- receipt is corrected down) isn't one the client may make itself.
    v_prev := current_setting('app.approval_rpc', true);
    perform set_config('app.approval_rpc', 'on', true);
    update public.purchase_orders set status = v_new where id = p_po_id;
    perform set_config('app.approval_rpc', coalesce(v_prev, ''), true);
  end if;
  return v_new;
end;
$$;

-- Trigger-only helper (no org check of its own).
revoke all on function public.po_refresh_receipt_status(uuid) from public, anon, authenticated;

create or replace function public.goods_receipt_lines_refresh_po_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_po_ids uuid[] := '{}';
  v_po uuid;
begin
  if TG_OP = 'UPDATE'
     and NEW.quantity_received is not distinct from OLD.quantity_received
     and NEW.po_line_item_id   is not distinct from OLD.po_line_item_id then
    return null;
  end if;
  if TG_OP <> 'INSERT' then
    -- The receipt header may already be gone (cascade delete); fall back to
    -- the PO line.
    v_po := coalesce(
      (select gr.purchase_order_id from public.goods_receipts gr where gr.id = OLD.receipt_id),
      (select li.po_id from public.po_line_items li where li.id = OLD.po_line_item_id));
    v_po_ids := v_po_ids || v_po;
  end if;
  if TG_OP <> 'DELETE' then
    v_po := coalesce(
      (select gr.purchase_order_id from public.goods_receipts gr where gr.id = NEW.receipt_id),
      (select li.po_id from public.po_line_items li where li.id = NEW.po_line_item_id));
    v_po_ids := v_po_ids || v_po;
  end if;
  for v_po in select distinct u from unnest(v_po_ids) u where u is not null loop
    perform public.po_refresh_receipt_status(v_po);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_goods_receipt_lines_refresh_po_status on public.goods_receipt_lines;
create trigger trg_goods_receipt_lines_refresh_po_status
  after insert or update or delete on public.goods_receipt_lines
  for each row execute function public.goods_receipt_lines_refresh_po_status();

create or replace function public.goods_receipts_refresh_po_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if NEW.deleted_at is distinct from OLD.deleted_at
     or NEW.purchase_order_id is distinct from OLD.purchase_order_id then
    perform public.po_refresh_receipt_status(OLD.purchase_order_id);
    if NEW.purchase_order_id is distinct from OLD.purchase_order_id then
      perform public.po_refresh_receipt_status(NEW.purchase_order_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_goods_receipts_refresh_po_status on public.goods_receipts;
create trigger trg_goods_receipts_refresh_po_status
  after update of deleted_at, purchase_order_id on public.goods_receipts
  for each row execute function public.goods_receipts_refresh_po_status();

-- A PO line added, removed or re-quantified on a PO in receiving changes
-- whether the PO is fully received.
create or replace function public.po_line_items_refresh_receipt_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if TG_OP = 'UPDATE'
     and NEW.quantity is not distinct from OLD.quantity
     and NEW.po_id    is not distinct from OLD.po_id then
    return null;
  end if;
  if TG_OP <> 'INSERT' then
    perform public.po_refresh_receipt_status(OLD.po_id);
  end if;
  if TG_OP <> 'DELETE' and (TG_OP = 'INSERT' or NEW.po_id is distinct from OLD.po_id) then
    perform public.po_refresh_receipt_status(NEW.po_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_po_line_items_refresh_receipt_status on public.po_line_items;
create trigger trg_po_line_items_refresh_receipt_status
  after insert or update of quantity, po_id or delete on public.po_line_items
  for each row execute function public.po_line_items_refresh_receipt_status();
