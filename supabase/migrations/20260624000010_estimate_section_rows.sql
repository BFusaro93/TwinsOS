-- Section header rows in the estimate line items grid
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS row_type     text NOT NULL DEFAULT 'item'
    CHECK (row_type IN ('item', 'section')),
  ADD COLUMN IF NOT EXISTS section_name text;
