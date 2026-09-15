-- Reconstructed from supabase_migrations.schema_migrations (statements
-- column) on production — this version was applied directly with no
-- matching local file, discovered during the 2026-09-14 migration drift
-- reconciliation (see migration-drift-check.yml).

ALTER TABLE crm_document_templates
  ALTER COLUMN include_pdf SET DEFAULT true;

UPDATE crm_document_templates
SET include_pdf = true
WHERE include_pdf = false
  AND doc_type IN ('invoice_email', 'estimate');
