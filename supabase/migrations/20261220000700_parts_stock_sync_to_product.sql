-- A Part and its linked product_items row both carry quantity_on_hand and the
-- "Track inventory" flag, but only best-effort app code copied the Part's
-- values across after each stock move (syncPartQtyToProduct, the PM
-- generate-WO route's syncPartsToProducts). Any failure there, or any write
-- that moved parts alone (an RPC, a backfill, a migration), left the two
-- disagreeing — the data audit found 10 drifted pairs on a real org.
--
-- The Part is authoritative (it is what CMMS stock, work-order usage and
-- receiving move; see 20261017170757), so mirror it from the database: after
-- a part's quantity / is_inventory / link changes, copy them onto the linked
-- product. is_inventory is copied only onto maintenance_part products, the
-- same scope as 20261017170757. The distinct-from guard makes the app-side
-- sync (and the product -> part edit path) a no-op round trip rather than a
-- loop. SECURITY DEFINER so a stock move made by a login that can't edit
-- products (e.g. a technician adding a part to a work order) still mirrors;
-- it only ever writes the one product the part is linked to, in the part's org.
--
-- No backfill here: existing drift is repaired per environment.

create or replace function public.sync_part_stock_to_product()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_item_id is null or new.deleted_at is not null then
    return new;
  end if;

  update public.product_items p
     set quantity_on_hand = new.quantity_on_hand,
         is_inventory = case
           when p.category = 'maintenance_part' then coalesce(new.is_inventory, false)
           else p.is_inventory
         end
   where p.id = new.product_item_id
     and p.org_id = new.org_id
     and p.deleted_at is null
     and (p.quantity_on_hand is distinct from new.quantity_on_hand
          or (p.category = 'maintenance_part'
              and coalesce(p.is_inventory, false) is distinct from coalesce(new.is_inventory, false)));

  return new;
end;
$$;

revoke all on function public.sync_part_stock_to_product() from public, anon, authenticated;

drop trigger if exists trg_parts_sync_stock_to_product on public.parts;
create trigger trg_parts_sync_stock_to_product
  after insert or update of quantity_on_hand, is_inventory, product_item_id, deleted_at on public.parts
  for each row
  execute function public.sync_part_stock_to_product();
