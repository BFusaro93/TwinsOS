-- Skipping a work order returns the parts it deducted to stock.
--
-- A PM work order generated with per-asset parts deducts those parts from
-- parts.quantity_on_hand at creation (adjust_part_quantity via
-- set_wo_part_stock). Skipping the WO ("we didn't do this service") left the
-- deduction in place forever, so on-hand drifted low and the usage was
-- attributed to work that never happened.
--
-- A single AFTER UPDATE OF status trigger covers every write path (UI, bulk
-- status change, PM batch/sub-WOs, v1 API):
--   * -> 'skipped'      : every live wo_parts line is set to 0 deducted via
--                         set_wo_part_stock(id, 0). Only what the line really
--                         deducted is credited (quantity_deducted), cost layers
--                         and the part audit trail ("returned N from WO-…")
--                         move with it, and the product_items mirror is
--                         re-synced. Idempotent: a second run finds
--                         quantity_deducted = 0 and moves nothing.
--   * 'skipped' -> else : the lines are set back to their full quantity
--                         (re-deduct, clamped at 0 on hand; any clamped
--                         remainder shows in wo_part_shortfalls and settles on
--                         the next receipt, exactly like a line added before
--                         stock arrived). wo_part_shortfalls and
--                         receive_part_quantity already ignore skipped WOs.
--
-- set_wo_part_stock needs an authenticated caller. The service-role v1 API
-- cannot set status 'skipped', but it can reopen a skipped WO; with no
-- auth.uid() the re-deduction is left undone, which is self-consistent: the
-- lines have quantity_deducted < quantity on a non-skipped WO, so they surface
-- in wo_part_shortfalls and settle on the next receipt.

create or replace function public.wo_status_sync_part_stock()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_line     record;
  v_touched  uuid[] := '{}';
  v_to_skip  boolean := new.status = 'skipped';
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'skipped' and old.status is distinct from 'skipped' then
    return new;
  end if;
  if new.deleted_at is not null or auth.uid() is null then
    return new;
  end if;

  for v_line in
    select wp.id, wp.part_id, wp.quantity
      from public.wo_parts wp
     where wp.work_order_id = new.id
       and wp.deleted_at is null
       and wp.part_id is not null
     order by wp.created_at, wp.id
  loop
    perform public.set_wo_part_stock(v_line.id, case when v_to_skip then 0 else v_line.quantity end);
    v_touched := v_touched || v_line.part_id;
  end loop;

  -- Keep the linked product's stock mirror in step (the client helper
  -- syncPartQtyToProduct does the same after its own stock moves).
  if array_length(v_touched, 1) is not null then
    update public.product_items pi
       set quantity_on_hand = p.quantity_on_hand
      from public.parts p
     where p.id = any (v_touched)
       and pi.id = p.product_item_id
       and pi.org_id = new.org_id
       and pi.quantity_on_hand is distinct from p.quantity_on_hand;
  end if;

  return new;
end;
$function$;

revoke execute on function public.wo_status_sync_part_stock() from public, anon;

drop trigger if exists trg_work_orders_sync_part_stock on public.work_orders;
create trigger trg_work_orders_sync_part_stock
  after update of status on public.work_orders
  for each row
  execute function public.wo_status_sync_part_stock();
