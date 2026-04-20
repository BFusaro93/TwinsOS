-- Allow decimal quantities (up to 2 decimal places) on PO and requisition
-- line items, and on goods receipt lines.  Parts / inventory on-hand counts
-- remain integer because they represent discrete physical units.

ALTER TABLE po_line_items
  ALTER COLUMN quantity TYPE numeric(10, 2);

ALTER TABLE requisition_line_items
  ALTER COLUMN quantity TYPE numeric(10, 2);

ALTER TABLE goods_receipt_lines
  ALTER COLUMN quantity_ordered  TYPE numeric(10, 2),
  ALTER COLUMN quantity_received TYPE numeric(10, 2),
  ALTER COLUMN quantity_remaining TYPE numeric(10, 2);
