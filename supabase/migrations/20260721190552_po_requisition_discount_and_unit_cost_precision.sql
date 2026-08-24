-- Add a manual "discount" field to purchase_orders and requisitions, stored
-- alongside shipping_cost (positive magnitude, subtracted in totals) instead
-- of overloading shipping_cost for both shipping charges and discounts.
alter table purchase_orders add column discount_cost integer not null default 0;
alter table requisitions add column discount_cost integer not null default 0;

-- Allow fractional-cent precision on unit cost so case/bulk pricing (e.g.
-- $201.98 for 4 units = $50.495 each) can be entered exactly. total_cost and
-- all other monetary columns remain whole-cent integers. Scoped to the PO/
-- requisition line item tables (not product_items.unit_cost, which the
-- rpt_products view depends on and isn't the entry point users hit this on).
alter table po_line_items alter column unit_cost type numeric(12,4);
alter table requisition_line_items alter column unit_cost type numeric(12,4);
