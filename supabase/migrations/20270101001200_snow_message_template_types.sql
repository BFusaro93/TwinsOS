-- Snow client messages: the snow board's "Email clients / Text clients" compose
-- dialog and the automation engine both draw their fixed wording from the
-- org's Documents templates (crm_document_templates), the same store automations
-- already use for email and text steps. Snow gets two template kinds so the
-- compose dialog can offer only snow-relevant templates (and the builder shows
-- the snow merge tags: storm name/date, crew, status, arrival).
--   snow_email : block-based HTML email body (+ subject)
--   snow_text  : plain-text SMS body
alter table public.crm_document_templates
  drop constraint if exists crm_document_templates_doc_type_check;
alter table public.crm_document_templates
  add constraint crm_document_templates_doc_type_check
  check (doc_type in ('client', 'estimate', 'invoice_email', 'marketing', 'chemical', 'text_message', 'chemical_recommendation', 'chemical_upsell', 'snow_email', 'snow_text'));
