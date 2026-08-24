-- The WO-scoped adjust_part_quantity(p_part_id, p_delta, p_work_order_id)
-- clamps quantity_on_hand at 0 (GREATEST(0, ...)) when a negative delta
-- (parts consumed on a Work Order) would take it below zero. Unlike its
-- receiving sibling (adjust_part_quantity(p_org_id, p_part_id, p_delta,
-- p_po_number)), which RAISEs when a correction would go negative, this one
-- silently succeeds — the caller has no way to know less was actually
-- deducted than was requested (using 5 units when only 2 are in stock
-- silently applies -2, not -5, with zero signal to the person who typed 5).
--
-- Rather than making this RAISE too (a bigger behavior change — WO parts
-- usage is routinely recorded before or without a formal receiving step, so
-- a hard block here would break normal usage), return the actual applied
-- delta alongside the old/new quantities so the caller can detect a clamp
-- and show the user a warning instead of silently succeeding either way.

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
  v_user_id     uuid;
  v_user_name   text;
  v_org_id      uuid;
  v_old_qty     integer;
  v_new_qty     integer;
  v_part_name   text;
  v_wo_number   text;
  v_description text;
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

  select quantity_on_hand, name, org_id into v_old_qty, v_part_name, v_org_id
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

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
  set quantity_on_hand = v_new_qty,
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
  applied_delta := v_new_qty - v_old_qty;
  return next;
end;
$$;
