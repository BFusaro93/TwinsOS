-- Templates items were missing unit + discount fields that real estimate line
-- items have, so a template couldn't represent a product/material (needs
-- unit_type) or a pre-applied discount. Mirrors estimate_line_items' columns.
ALTER TABLE estimate_template_items
  ADD COLUMN IF NOT EXISTS unit_type text,
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_type text CHECK (discount_type IN ('flat', 'percent')),
  ADD COLUMN IF NOT EXISTS discount_value integer,
  ADD COLUMN IF NOT EXISTS applied_discount_id uuid REFERENCES crm_discounts(id) ON DELETE SET NULL;
