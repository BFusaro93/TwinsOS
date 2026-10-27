-- Backfill catalog products for the sandbox org's parts that have none.
--
-- The 9/29 sandbox seed copied ~418 parts with parts.product_item_id NULL,
-- so receiving a PO line for any of them fails ("No catalog product found")
-- and they never show in the PO catalog. This does what useCreatePart does
-- for a standalone part (create a maintenance_part product_items row
-- mirroring the part, then link parts.product_item_id), once per part.
--
-- STRICTLY scoped to org a1b2c3d4-e5f6-7890-abcd-ef1234567890 and to rows
-- whose product_item_id is NULL, so it is idempotent and touches no other
-- org. Never run against the real "Twins Lawn Service" org.
--
--   1. A part whose part number matches an existing live, unlinked
--      maintenance_part product in the org (33 of the 418: the seed's
--      orphaned products) is LINKED to it instead of creating a duplicate
--      (uq_product_items_org_part_number would reject one). The product's
--      stock is set to the part's, as syncPartQtyToProduct does.
--   2. Every other part gets a new product (name, part_number, description,
--      unit_cost, price = unit_cost, vendor, is_inventory, minimum_stock,
--      quantity_on_hand, part_category = part category, cost_layers []),
--      matching the app's create path. Parts whose number collides with a
--      product already owned by another part are skipped (reported).
--   3. PO lines with NULL product_item_id are linked through their part:
--      line.part_id, else the single live part with the same part number
--      (which also fills line.part_id). Ambiguous / unmatched lines stay.
--
-- guard_procurement_line_items would send an 'approved' PO back to approval
-- on a line edit unless the approval GUC is on, so it is set for the
-- transaction (same switch the approval RPCs use).

do $backfill$
declare
  c_org constant uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  r        record;
  v_prod   uuid;
  v_linked int := 0;
  v_created int := 0;
  v_skipped int := 0;
  v_lines  int := 0;
begin
  perform set_config('app.approval_rpc', 'on', true);

  for r in
    select * from public.parts
     where org_id = c_org and deleted_at is null and product_item_id is null
     order by created_at, id
  loop
    v_prod := null;

    if coalesce(r.part_number, '') <> '' then
      -- Existing live product with this part number in the org.
      select pi.id into v_prod
        from public.product_items pi
       where pi.org_id = c_org
         and pi.part_number = r.part_number
         and pi.deleted_at is null
         and pi.category = 'maintenance_part'
         and not exists (select 1 from public.parts p2
                          where p2.product_item_id = pi.id and p2.deleted_at is null);
      if v_prod is null and exists (
        select 1 from public.product_items pi
         where pi.org_id = c_org and pi.part_number = r.part_number and pi.deleted_at is null
      ) then
        -- Number already taken by a product we must not repurpose.
        v_skipped := v_skipped + 1;
        continue;
      end if;
    end if;

    if v_prod is not null then
      update public.product_items
         set quantity_on_hand = r.quantity_on_hand
       where id = v_prod and quantity_on_hand is distinct from r.quantity_on_hand;
      v_linked := v_linked + 1;
    else
      insert into public.product_items (
        org_id, created_by, name, description, part_number, category,
        unit_cost, price, vendor_id, vendor_name, alternate_vendors,
        is_inventory, quantity_on_hand, minimum_stock, part_category, cost_layers
      ) values (
        c_org, r.created_by, r.name, coalesce(r.description, ''), coalesce(r.part_number, ''), 'maintenance_part',
        coalesce(r.unit_cost, 0), coalesce(r.unit_cost, 0), r.vendor_id, coalesce(r.vendor_name, ''), '[]'::jsonb,
        coalesce(r.is_inventory, false), coalesce(r.quantity_on_hand, 0), coalesce(r.minimum_stock, 0),
        r.category, '[]'::jsonb
      )
      returning id into v_prod;
      v_created := v_created + 1;
    end if;

    update public.parts set product_item_id = v_prod
     where id = r.id and product_item_id is null;
  end loop;

  -- PO lines with no catalog product: link through the part.
  with candidates as (
    select li.id as line_id,
           coalesce(li.part_id, pn.id) as part_id,
           coalesce(lp.product_item_id, pn.product_item_id) as product_item_id
      from public.po_line_items li
      left join public.parts lp
             on lp.id = li.part_id and lp.org_id = c_org
      left join lateral (
        select p.id, p.product_item_id
          from public.parts p
         where li.part_id is null
           and coalesce(li.part_number, '') <> ''
           and p.org_id = c_org and p.deleted_at is null
           and p.part_number = li.part_number
        limit 2
      ) pn on true
     where li.org_id = c_org and li.product_item_id is null
  ),
  unambiguous as (
    select c.line_id, c.part_id, c.product_item_id
      from candidates c
     where c.product_item_id is not null
  )
  update public.po_line_items li
     set product_item_id = u.product_item_id,
         part_id = coalesce(li.part_id, u.part_id)
    from unambiguous u
   where li.id = u.line_id and li.org_id = c_org and li.product_item_id is null;
  get diagnostics v_lines = row_count;

  raise notice 'sandbox part-product backfill: % created, % linked to existing, % skipped, % PO lines linked',
    v_created, v_linked, v_skipped, v_lines;
end
$backfill$;
