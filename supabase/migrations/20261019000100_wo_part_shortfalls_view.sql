-- Work-order part lines that took less stock than they used.
--
-- Adding a part to a WO deducts from quantity_on_hand but never below 0, so a
-- WO created before its PO is received records a shortfall:
-- wo_parts.quantity_deducted < quantity. receive_part_quantity settles it when
-- the receipt arrives (20261019000000); until then this view is what the Parts
-- page badge, the "Used without stock" filter and the part sheet read.
--
-- Legacy lines (quantity_deducted NULL) are "assumed fully deducted" and never
-- appear. security_invoker keeps the underlying RLS (org scoping) in force.

create or replace view public.wo_part_shortfalls
with (security_invoker = on) as
select
  wp.id              as wo_part_id,
  wp.org_id,
  wp.part_id,
  wp.work_order_id,
  wo.work_order_number,
  wo.title           as work_order_title,
  wo.status          as work_order_status,
  wp.part_name,
  wp.part_number,
  wp.quantity,
  wp.quantity_deducted,
  wp.quantity - wp.quantity_deducted as short_qty,
  wp.created_at
from public.wo_parts wp
join public.work_orders wo on wo.id = wp.work_order_id
where wp.deleted_at is null
  and wo.deleted_at is null
  and wo.status <> 'skipped'
  and wp.part_id is not null
  and wp.quantity_deducted is not null
  and wp.quantity_deducted < wp.quantity;

grant select on public.wo_part_shortfalls to authenticated;
