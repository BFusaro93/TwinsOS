-- One-time correction: PO-2026-000408's four Pro-Trade lines were bought for
-- the "Suzanne Provenchal - Patio & Wall" project and used directly, but
-- receiving them added them to product on-hand. Receiving a project-assigned
-- line no longer touches stock (ReceiveGoodsDialog / use-goods-receipts), so
-- this removes the units that earlier receipt put on the shelf.
--
-- Pinned to one PO id, so it is a no-op on any database without that row
-- (TEST, the sandbox). Re-running is a no-op too: it only takes quantity that
-- is still sitting in this PO's cost layers. The PO lines, receipt rows and
-- the project's cost are untouched.

do $$
declare
  v_po_id    constant uuid := 'af2cdbee-990a-4e19-8673-b53f09ac2439';
  v_project  constant uuid := '63519b1b-5a0f-4169-bd4f-d204a4958e36';
  v_po_no    text;
  r          record;
  v_removed  numeric;
  v_layers   jsonb;
begin
  select po_number into v_po_no from public.purchase_orders where id = v_po_id;
  if v_po_no is null then
    return;
  end if;

  for r in
    select distinct pi.id, pi.quantity_on_hand, coalesce(pi.cost_layers, '[]'::jsonb) as layers
    from public.po_line_items li
    join public.product_items pi on pi.id = li.product_item_id
    where li.po_id = v_po_id
      and li.project_id = v_project
      and pi.deleted_at is null
  loop
    select coalesce(sum((l->>'quantity')::numeric), 0)
      into v_removed
      from jsonb_array_elements(r.layers) l
      where l->>'poNumber' = v_po_no;

    continue when v_removed <= 0;

    select coalesce(jsonb_agg(
             case when l->>'poNumber' = v_po_no
                  then jsonb_set(l, '{quantity}', '0'::jsonb)
                  else l end
             order by o), '[]'::jsonb)
      into v_layers
      from jsonb_array_elements(r.layers) with ordinality as t(l, o);

    update public.product_items
      set quantity_on_hand = greatest(0, coalesce(r.quantity_on_hand, 0) - v_removed),
          cost_layers = v_layers
      where id = r.id;
  end loop;
end;
$$;
