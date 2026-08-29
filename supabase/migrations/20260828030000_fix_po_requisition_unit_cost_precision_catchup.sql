-- 20260721190552_po_requisition_discount_and_unit_cost_precision.sql rolled
-- back in full on an environment where purchase_orders.discount_cost had
-- already been added out-of-band, so its unit_cost precision changes never
-- actually ran there. ALTER COLUMN ... TYPE to the same type is a no-op, so
-- this is safe to run everywhere, including where the original migration
-- already fully succeeded.
alter table po_line_items alter column unit_cost type numeric(12,4);
alter table requisition_line_items alter column unit_cost type numeric(12,4);
