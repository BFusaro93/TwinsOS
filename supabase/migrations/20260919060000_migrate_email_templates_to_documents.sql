-- One-time copy of the old crm_email_templates rows (estimate, chemical_application,
-- general) into the new crm_document_templates/crm_document_blocks system, now
-- that estimate/chemical/client sends read templates from there instead. This is
-- additive only -- crm_email_templates is left untouched.
--
-- doc_type mapping: estimate -> estimate, chemical_application -> chemical,
-- general -> client (the closest live equivalent: BulkEmailClientsDialog's
-- "Email Selected Clients" flow already reads docType = 'client' templates).

do $$
declare
  src record;
  new_doc_type text;
  new_template_id uuid;
begin
  for src in
    select * from crm_email_templates
    where deleted_at is null
      and template_type in ('estimate', 'chemical_application', 'general')
  loop
    new_doc_type := case src.template_type
      when 'estimate' then 'estimate'
      when 'chemical_application' then 'chemical'
      when 'general' then 'client'
    end;

    insert into crm_document_templates (
      org_id, name, doc_type, description, subject, status, is_default, include_pdf, created_at
    ) values (
      src.org_id,
      src.name,
      new_doc_type,
      'Migrated from the old email templates settings.',
      src.subject,
      'active',
      src.is_default,
      coalesce(src.include_pdf, false),
      src.created_at
    )
    returning id into new_template_id;

    insert into crm_document_blocks (
      template_id, org_id, block_type, order_index, content
    ) values (
      new_template_id, src.org_id, 'paragraph', 0, src.body_html
    );
  end loop;
end $$;
