-- Editing a Part synced name/cost/quantity/vendor to its linked product_items
-- row but not is_inventory (the product->part direction did), so the two
-- "Track inventory" flags drifted (26 pairs on the real org). The Part is the
-- record CMMS stock and work-order usage live on, so it wins: align each
-- maintenance_part product's flag to its linked part. The app-side gap is
-- closed in use-parts.ts.

update public.product_items p
  set is_inventory = coalesce(pt.is_inventory, false)
  from public.parts pt
  where pt.product_item_id = p.id
    and pt.deleted_at is null
    and p.deleted_at is null
    and p.category = 'maintenance_part'
    and coalesce(p.is_inventory, false) is distinct from coalesce(pt.is_inventory, false);
