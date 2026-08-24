-- Vendor invoices are sometimes priced/measured to 3 decimal places (e.g.
-- 140.878 tons). quantity was numeric(10,2), which silently rounded to 2
-- decimals on save even after the UI stopped blocking the input.

ALTER TABLE public.po_line_items ALTER COLUMN quantity TYPE numeric(10,3);
ALTER TABLE public.requisition_line_items ALTER COLUMN quantity TYPE numeric(10,3);
