-- receive_part_quantity updated parts.unit_cost on every goods receipt but
-- never propagated it to the linked product_items row, so product_items.unit_cost
-- goes stale while parts.unit_cost stays current. Manual edits (useUpdatePart /
-- useUpdateProduct) already sync both directions — this closes the one gap
-- in the receiving flow. Based on the live function definition (not the
-- original migration file, which had drifted from what's deployed).
create or replace function public.receive_part_quantity(p_org_id uuid, p_part_id uuid, p_quantity integer, p_new_unit_cost integer, p_new_cost_layers jsonb, p_po_number text)
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

  select quantity_on_hand, unit_cost, name, product_item_id into v_old_qty, v_old_cost, v_part_name, v_product_item_id
    from public.parts
    where id = p_part_id and org_id = p_org_id and deleted_at is null
    for update;
  if not found then
    raise exception 'Part not found';
  end if;
  v_new_qty := v_old_qty + p_quantity;

  perform set_config('app.suppress_parts_qty_audit', 'true', true);

  update public.parts
  set quantity_on_hand = v_new_qty,
      unit_cost         = p_new_unit_cost,
      cost_layers       = p_new_cost_layers
  where id = p_part_id and org_id = p_org_id;

  if v_product_item_id is not null then
    update public.product_items
    set unit_cost = p_new_unit_cost,
        price     = p_new_unit_cost
    where id = v_product_item_id and org_id = p_org_id;
  end if;

  v_description := v_part_name || ': received ' || p_quantity || ' via PO ' ||
    coalesce(nullif(p_po_number, ''), '(unknown)');
  if p_new_unit_cost is distinct from v_old_cost then
    v_description := v_description || ' (unit cost $' ||
      round(v_old_cost::numeric / 100, 2) || ' → $' || round(p_new_unit_cost::numeric / 100, 2) || ')';
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
