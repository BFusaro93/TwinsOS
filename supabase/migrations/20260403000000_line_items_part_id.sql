-- Add part_id to po_line_items and requisition_line_items so that line items
-- created from CMMS parts (which may not have a linked product_item_id) can
-- still be navigated to via the part detail sheet.

ALTER TABLE public.po_line_items
  ADD COLUMN part_id uuid REFERENCES public.parts(id);

ALTER TABLE public.requisition_line_items
  ADD COLUMN part_id uuid REFERENCES public.parts(id);
