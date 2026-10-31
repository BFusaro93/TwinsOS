-- A Service Bundle can be linked to an estimate document (a crm_document_templates
-- row of doc_type 'estimate'), like Service Autopilot's "Est. Document" on a
-- job template. Applying the bundle stamps the choice on the estimate, and the
-- Send dialog pre-selects it.

alter table public.estimate_templates
  add column if not exists document_template_id uuid
    references public.crm_document_templates(id) on delete set null;

alter table public.estimates
  add column if not exists document_template_id uuid
    references public.crm_document_templates(id) on delete set null;
