-- Estimate-type documents can carry their own client-facing display toggles
-- (see 20260811042659_estimate_display_settings.sql). NULL = the document sets
-- none, so the bundle / org default applies. When a document is chosen on an
-- estimate its toggles are copied onto the estimate, so editing the document
-- later never changes an estimate already in progress or a proposal already sent.
ALTER TABLE crm_document_templates
  ADD COLUMN IF NOT EXISTS display_settings jsonb;
