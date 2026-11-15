-- Deleting a work order: one RPC, and a Done work order asks whether its parts
-- went back on the shelf (owner decision, bug sweep round 14). Also F6: the
-- stock audit line says what was really taken.
--
-- 1. delete_work_order(p_work_order_id, p_parts_returned default null)
--    SECURITY INVOKER, so every RLS policy on work_orders / wo_parts applies
--    (org, read-only org, crew, role guards). Deletes the work order and every
--    live sub-WO under it (any depth), in one transaction:
--      * parts on an open / on-hold / in-progress / skipped WO go back to stock
--        (set_wo_part_stock(line, 0) — only what each line actually took);
--      * parts on a DONE WO go back only when p_parts_returned = true; with
--        false they stay used. When the tree has a Done WO with parts that took
--        stock and p_parts_returned is NULL, the delete is refused — the caller
--        must ask.
--    Children are soft-deleted before the parent. Returns
--    {deleted, returned_lines, kept_lines}.
--    The client used to walk the tree, return every line's stock and soft-
--    delete row by row; a Done WO's fitted parts were always put back.
--    20270106000240 (AFTER deploy) makes this RPC the only end-user path that
--    can soft-delete a work order.
--
-- 2. adjust_part_quantity(part, delta, work_order, return_cost) — re-stated
--    from its LIVE definition; only the audit description changes: it records
--    the quantity actually applied, plus "(N short)" when stock ran out
--    (it used to say "used 5" when only 2 were on hand).
--
-- DEPLOY: BEFORE the code deploy (new function; old code keeps working).

-- ── 1. delete_work_order ───────────────────────────────────────────────────
create or replace function public.delete_work_order(
  p_work_order_id uuid,
  p_parts_returned boolean default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
declare
  v_root      public.work_orders%rowtype;
  v_ids       uuid[];
  v_frontier  uuid[];
  v_next      uuid[];
  v_line      record;
  v_returned  integer := 0;
  v_kept      integer := 0;
  v_now       timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;
  if coalesce(public.my_role(), '') in ('viewer', 'requestor', 'purchaser', 'crew') then
    raise exception 'Your role can''t delete work orders.' using errcode = '42501';
  end if;
  if public.my_org_is_read_only() then
    raise exception 'This account is read-only.' using errcode = '42501';
  end if;

  select * into v_root
    from public.work_orders
   where id = p_work_order_id and deleted_at is null;
  if not found then
    raise exception 'Work order not found' using errcode = 'P0002';
  end if;

  -- The whole live tree under it.
  v_ids := array[v_root.id];
  v_frontier := v_ids;
  loop
    select coalesce(array_agg(wo.id), '{}')
      into v_next
      from public.work_orders wo
     where wo.parent_work_order_id = any (v_frontier)
       and wo.deleted_at is null
       and not (wo.id = any (v_ids));
    exit when cardinality(v_next) = 0;
    v_ids := v_ids || v_next;
    v_frontier := v_next;
  end loop;

  -- Lock the tree so a concurrent status change can't slip in between.
  perform 1 from public.work_orders where id = any (v_ids) for update;

  if p_parts_returned is null and exists (
       select 1
         from public.wo_parts wp
         join public.work_orders wo on wo.id = wp.work_order_id
        where wp.work_order_id = any (v_ids)
          and wp.deleted_at is null
          and wp.part_id is not null
          and wo.status = 'done'
          and coalesce(wp.quantity_deducted, wp.quantity) > 0
     ) then
    raise exception 'This work order (or a sub work order under it) is Done. Say whether its parts went back on the shelf before deleting it.'
      using errcode = '22023';
  end if;

  for v_line in
    select wp.id, wo.status
      from public.wo_parts wp
      join public.work_orders wo on wo.id = wp.work_order_id
     where wp.work_order_id = any (v_ids)
       and wp.deleted_at is null
       and wp.part_id is not null
     order by wp.created_at, wp.id
  loop
    if v_line.status = 'done' and p_parts_returned is not true then
      v_kept := v_kept + 1;
    else
      perform public.set_wo_part_stock(v_line.id, 0);
      v_returned := v_returned + 1;
    end if;
  end loop;

  -- Children first, so a failure part-way never leaves a live child under a
  -- deleted parent. The GUC is what work_orders_soft_delete_guard
  -- (20270106000240) checks.
  perform set_config('app.wo_delete_rpc', 'on', true);
  update public.work_orders
     set deleted_at = v_now
   where id = any (v_ids) and id <> v_root.id and deleted_at is null;
  update public.work_orders
     set deleted_at = v_now
   where id = v_root.id;
  perform set_config('app.wo_delete_rpc', '', true);

  return jsonb_build_object(
    'deleted', cardinality(v_ids),
    'returned_lines', v_returned,
    'kept_lines', v_kept
  );
end;
$function$;

revoke all on function public.delete_work_order(uuid, boolean) from public, anon;
grant execute on function public.delete_work_order(uuid, boolean) to authenticated, service_role;

-- ── 2. adjust_part_quantity: audit the applied quantity ────────────────────
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
