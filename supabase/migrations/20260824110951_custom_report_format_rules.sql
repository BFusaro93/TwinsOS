-- Conditional formatting (cell color-coding) for saved analyses — e.g.
-- "Balance > $1000 → red". Kept as its own column, same reasoning as the
-- visual_type/label_column/etc columns: it's display-only metadata, not
-- part of the AnalysisConfig used for querying.
ALTER TABLE crm_custom_reports
  ADD COLUMN IF NOT EXISTS format_rules jsonb NOT NULL DEFAULT '[]'::jsonb;
