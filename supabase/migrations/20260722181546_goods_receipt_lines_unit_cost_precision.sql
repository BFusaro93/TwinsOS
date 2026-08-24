-- Goods receipt lines copy unit_cost straight from po_line_items, which was
-- widened to numeric(12,4) in 20260721000001 to support fractional-cent
-- case/bulk pricing (e.g. $201.98 for 4 units = $50.495 each). Receiving such
-- a line failed with "invalid input syntax for type integer" because
-- goods_receipt_lines.unit_cost was still integer. Widen it to match.
alter table goods_receipt_lines alter column unit_cost type numeric(12,4);
