-- The previous constraint blocks inserting a second product with a blank part number.
-- Replace it with a partial unique index that only enforces uniqueness when
-- part_number is actually filled in and the record is not soft-deleted.
ALTER TABLE product_items DROP CONSTRAINT IF EXISTS uq_product_items_org_part_number;
DROP INDEX IF EXISTS uq_product_items_org_part_number;

CREATE UNIQUE INDEX uq_product_items_org_part_number
  ON product_items (org_id, part_number)
  WHERE part_number <> '' AND deleted_at IS NULL;
