-- Packages on estimates: tag an estimate line with the crm_packages row it was
-- added from, so converting the estimate can create a PACKAGE job (steps,
-- windows, total steps) instead of a plain job. Nullable: ordinary lines and
-- every existing line stay untagged. Soft-deleted packages keep their id, so
-- ON DELETE SET NULL only matters for a hard delete.
ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES crm_packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimate_line_items_package_id
  ON estimate_line_items (package_id) WHERE package_id IS NOT NULL;
