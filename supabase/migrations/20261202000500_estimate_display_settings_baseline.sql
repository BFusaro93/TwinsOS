-- Remembers the display toggles an estimate last received from a document, bundle
-- or org default. If the estimate's current toggles differ from this baseline,
-- someone changed them by hand, and switching document or applying a bundle asks
-- before overwriting them. NULL = never copied (older estimates).
ALTER TABLE estimates
  ADD COLUMN IF NOT EXISTS display_settings_baseline jsonb;
