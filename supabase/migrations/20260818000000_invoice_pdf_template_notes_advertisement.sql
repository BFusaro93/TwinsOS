-- Template-level default Notes text and an "advertisement"/service-update
-- blurb — a lighter alternative to a full drag-and-drop invoice content
-- editor. Notes falls back to this when an invoice has none of its own;
-- the advertisement line always shows (same on every invoice using the
-- template), matching the org's existing paper statement format.
ALTER TABLE crm_invoice_pdf_templates
  ADD COLUMN IF NOT EXISTS default_notes text,
  ADD COLUMN IF NOT EXISTS advertisement_text text;
