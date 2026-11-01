-- Service Autopilot-style estimate documents: an Estimate-type document is the
-- PROPOSAL layout; the Estimate Email and Confirmation Email are separate
-- Client-type documents linked from it. Settings live on the estimate document.

alter table public.crm_document_templates
  add column if not exists estimate_email_document_id uuid
    references public.crm_document_templates(id) on delete set null,
  add column if not exists confirmation_document_id uuid
    references public.crm_document_templates(id) on delete set null,
  add column if not exists confirmation_recipient text not null default 'primary_email',
  add column if not exists confirmation_include_estimate_pdf boolean not null default false;

alter table public.crm_document_templates
  drop constraint if exists crm_document_templates_confirmation_recipient_check;
alter table public.crm_document_templates
  add constraint crm_document_templates_confirmation_recipient_check
  check (confirmation_recipient in ('primary_email', 'billing_email'));

-- New 'estimate_grid' block (the line-items table inside an estimate document).
alter table public.crm_document_blocks drop constraint if exists crm_document_blocks_block_type_check;
alter table public.crm_document_blocks add constraint crm_document_blocks_block_type_check
  check (block_type in ('header','paragraph','list','divider','spacer','line_items','signature','image','button','columns','estimate_grid'));

-- Data migration: until now estimate-type documents WERE the estimate email
-- body. Convert them to client-type so they remain selectable Estimate Emails
-- (blocks untouched). No unique index exists on is_default (it is maintained
-- in application code, one default per doc_type), so an org's estimate default
-- simply becomes a client default only when that org has no client default
-- already; otherwise it is cleared to keep one default per type.
update public.crm_document_templates e
set is_default = false
where e.doc_type = 'estimate' and e.is_default
  and exists (
    select 1 from public.crm_document_templates c
    where c.org_id = e.org_id and c.doc_type = 'client' and c.is_default and c.deleted_at is null
  );

update public.crm_document_templates
set doc_type = 'client'
where doc_type = 'estimate';

-- Estimates / bundles pointing at a converted document would now point at an
-- email, not a proposal layout; null them so rendering uses the built-in one.
update public.estimates e set document_template_id = null
where document_template_id is not null
  and exists (select 1 from public.crm_document_templates t where t.id = e.document_template_id and t.doc_type <> 'estimate');
update public.estimate_templates e set document_template_id = null
where document_template_id is not null
  and exists (select 1 from public.crm_document_templates t where t.id = e.document_template_id and t.doc_type <> 'estimate');
