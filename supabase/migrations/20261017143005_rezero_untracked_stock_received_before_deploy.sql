-- Follow-up to 20261014164140: POs 410-413 were received on 2026-10-16, before
-- the "honor Track inventory" receiving change (PR #260) deployed, so 13
-- untracked project_material products picked up stock again. Same snapshot +
-- zero as the first cleanup (snapshot table already exists). Idempotent: only
-- touches untracked non-maintenance products that still show stock.

insert into public.product_untracked_stock_cleanup
  (org_id, product_id, quantity_on_hand, cost_layers, unit_cost)
select org_id, id, quantity_on_hand, cost_layers, unit_cost
  from public.product_items
  where deleted_at is null
    and coalesce(is_inventory, false) = false
    and category <> 'maintenance_part'
    and coalesce(quantity_on_hand, 0) <> 0;

update public.product_items
  set quantity_on_hand = 0,
      cost_layers = '[]'::jsonb
  where deleted_at is null
    and coalesce(is_inventory, false) = false
    and category <> 'maintenance_part'
    and coalesce(quantity_on_hand, 0) <> 0;
