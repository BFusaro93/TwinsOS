-- crm_document_templates.include_pdf has defaulted to false since the table
-- was created, so every invoice/estimate email template anyone has ever
-- created had "Attach PDF" silently unchecked — nobody deliberately opted
-- out of attaching the PDF, the checkbox just started off wrong. The
-- sibling legacy table (crm_email_templates) already got this same fix.
-- Flip the default going forward and backfill existing templates that
-- still have the never-intentionally-chosen false value.
ALTER TABLE crm_document_templates
  ALTER COLUMN include_pdf SET DEFAULT true;

UPDATE crm_document_templates
SET include_pdf = true
WHERE include_pdf = false
  AND doc_type IN ('invoice_email', 'estimate');
