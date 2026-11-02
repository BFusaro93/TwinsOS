-- Chemical emails come in three kinds, as in Service Autopilot: Client Instruction
-- (the existing 'chemical' type), Recommendation (a follow-up observation about the
-- property) and Upsale (other services the client could add). Each is its own
-- document-template type so the send dialog can offer the right templates.
alter table public.crm_document_templates
  drop constraint if exists crm_document_templates_doc_type_check;
alter table public.crm_document_templates
  add constraint crm_document_templates_doc_type_check
  check (doc_type in ('client', 'estimate', 'invoice_email', 'marketing', 'chemical', 'text_message', 'chemical_recommendation', 'chemical_upsell'));
