-- Add 'chemical' and 'text_message' document types (see SA Document Editor
-- guide: Chemical covers client instruction/recommendation/upsell emails
-- about applied products; Text Message covers SMS sent via the mobile app).

alter table crm_document_templates
  drop constraint if exists crm_document_templates_doc_type_check;

alter table crm_document_templates
  add constraint crm_document_templates_doc_type_check
  check (doc_type in ('client', 'estimate', 'invoice_email', 'marketing', 'chemical', 'text_message'));
