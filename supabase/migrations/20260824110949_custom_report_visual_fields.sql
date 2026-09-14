-- Lets a saved "My Reports" analysis render as a chart (bar/line/pie/kpi),
-- not just a table — same visual fields Dashboard panels already have,
-- kept as separate columns rather than nested in `config` so the existing
-- AnalysisConfig shape (used directly for querying, and now also for
-- Dashboard's "add panel from saved analysis") is untouched.
ALTER TABLE crm_custom_reports
  ADD COLUMN IF NOT EXISTS visual_type text,
  ADD COLUMN IF NOT EXISTS label_column text,
  ADD COLUMN IF NOT EXISTS value_columns text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS kpi_column text;
