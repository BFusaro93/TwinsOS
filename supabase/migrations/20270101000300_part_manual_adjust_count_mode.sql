-- Manual part quantity adjustments: "shelf count" vs "found / correction",
-- plus a stale-quantity guard.
--
-- 1. Shelf count settles open work-order shortfalls. Using more of a part on a
--    work order than is in stock clamps the deduction at 0 and leaves the
--    line short (wo_parts.quantity_deducted < quantity, see wo_part_shortfalls);
--    the next receive_part_quantity takes the missing units then. A physical
--    shelf count already reflects those units being gone, but the manual
--    adjustment never cleared the shortfall, so the next receipt deducted them
--    a second time. p_kind = 'count' now marks that part's open shortfall
--    lines settled (quantity_deducted = quantity) WITHOUT moving stock;
--    p_kind = 'correction' (found stock, data fix, the CSV import and the part
--    form) leaves them alone, as before.
--
-- 2. Optimistic concurrency. p_expected_qty is the quantity the user was
--    looking at; when stock moved since (a receipt, a work order), the
--    adjustment is refused instead of silently overwriting that movement.
--
-- Every existing guard is kept: signed-in user, reason required, no
-- negatives, part must exist, _equipt_org_mismatch (org + limited-role write
-- guard). New parameters have defaults, so existing 3-argument callers keep
-- the old behaviour.
--
-- Replaces adjust_part_quantity_manual(uuid, integer, text) — latest body was
-- rewritten by 20260929140000_scope_limited_roles_to_equipt.

drop function if exists public.adjust_part_quantity_manual(uuid, integer, text);

create function public.adjust_part_quantity_manual(
  p_part_id      uuid,
  p_new_qty      integer,
  p_reason       text,
  p_kind         text    default 'correction',
  p_expected_qty integer default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id     uuid;
  v_user_name   text;
  v_org_id      uuid;
  v_old_qty     integer;
  v_part_name   text;
  v_unit_cost   numeric;
  v_cost_layers jsonb;
  v_delta       integer;
  v_kind        text := coalesce(nullif(btrim(p_kind), ''), 'correction');
  v_settled     integer := 0;
  v_suffix      text := '';
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'A reason is required for manual quantity adjustments';
  end if;

  if p_new_qty is null or p_new_qty < 0 then
    raise exception 'Quantity on hand cannot be negative';
  end if;

  if v_kind not in ('count', 'correction') then
    raise exception 'Unknown adjustment type: %', v_kind;
  end if;

  select quantity_on_hand, name, org_id, unit_cost, cost_layers
    into v_old_qty, v_part_name, v_org_id, v_unit_cost, v_cost_layers
    from public.parts
   where id = p_part_id and deleted_at is null
   for update;
  if not found then
    raise exception 'Part not found';
  end if;

  if public._equipt_org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_expected_qty is not null and p_expected_qty is distinct from v_old_qty then
    raise exception 'Stock changed since you opened this — refresh'
      using errcode = 'P0001',
            detail = format('Expected %s on hand, found %s.', p_expected_qty, v_old_qty);
  end if;

  -- A shelf count is the truth about what is on the shelf, so usage recorded
  -- while stock was short is already accounted for: settle it without moving
  -- stock, so the next receipt doesn't take those units again.
  if v_kind = 'count' then
    perform set_config('app.suppress_audit', 'true', true);
    update public.wo_parts wp
       set quantity_deducted = wp.quantity
      from public.work_orders wo
     where wo.id = wp.work_order_id
       and wp.part_id = p_part_id
       and wp.org_id = v_org_id
       and wp.deleted_at is null
       and wo.deleted_at is null
       and wo.status <> 'skipped'
       and wp.quantity_deducted is not null
       and wp.quantity_deducted < wp.quantity;
    get diagnostics v_settled = row_count;
    perform set_config('app.suppress_audit', '', true);
    if v_settled > 0 then
      v_suffix := format(' (settled %s work-order shortfall line%s)', v_settled, case when v_settled = 1 then '' else 's' end);
    end if;
  end if;

  select coalesce(name, email, id::text) into v_user_name
    from public.profiles
   where id = v_user_id
   limit 1;
  v_user_name := coalesce(v_user_name, 'System');

  if p_new_qty = v_old_qty then
    if v_settled > 0 then
      insert into public.audit_log (
        org_id, created_by, record_type, record_id, action,
        changed_by_name, description, field_changed, old_value, new_value
      ) values (
        v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
        v_user_name,
        v_part_name || ': shelf count confirmed ' || v_old_qty || ' on hand — ' || trim(p_reason) || v_suffix,
        'quantity_on_hand', v_old_qty::text, p_new_qty::text
      );
    end if;
    return;
  end if;

  v_delta := p_new_qty - v_old_qty;
  if v_delta > 0 then
    v_cost_layers := public.append_cost_layer(v_cost_layers, v_delta, v_unit_cost);
  else
    v_cost_layers := public.decrement_cost_layers(v_cost_layers, abs(v_delta));
  end if;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
     set quantity_on_hand = p_new_qty,
         cost_layers      = v_cost_layers,
         updated_at       = now()
   where id = p_part_id;

  insert into public.audit_log (
    org_id, created_by, record_type, record_id, action,
    changed_by_name, description, field_changed, old_value, new_value
  ) values (
    v_org_id, v_user_id, 'part', p_part_id, 'qty_adjusted',
    v_user_name,
    v_part_name || ': ' || case when v_kind = 'count' then 'shelf count' else 'quantity adjusted' end
      || ' — ' || trim(p_reason) || v_suffix,
    'quantity_on_hand', v_old_qty::text, p_new_qty::text
  );
end;
$function$;

revoke all on function public.adjust_part_quantity_manual(uuid, integer, text, text, integer) from public, anon;
grant execute on function public.adjust_part_quantity_manual(uuid, integer, text, text, integer) to authenticated, service_role;
