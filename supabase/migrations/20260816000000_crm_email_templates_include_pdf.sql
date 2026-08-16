-- The "Include PDF" checkbox in estimate/invoice email template settings had
-- no backing column, so it could never actually be respected when sending —
-- the send routes always attached the PDF regardless of the UI toggle.
ALTER TABLE crm_email_templates
  ADD COLUMN IF NOT EXISTS include_pdf boolean NOT NULL DEFAULT true;
