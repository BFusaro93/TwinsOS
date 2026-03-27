-- Add CMMS-specific fields to product_items so maintenance_part products
-- can track minimum stock levels and a CMMS part category without
-- requiring a join to the parts table.

ALTER TABLE public.product_items
  ADD COLUMN IF NOT EXISTS minimum_stock  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS part_category  text;
