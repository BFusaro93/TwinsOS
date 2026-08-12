-- crm_email_templates.org_id was NOT NULL with no default, so every insert
-- via useUpsertEmailTemplate() (which never sets org_id client-side) violated
-- the NOT NULL constraint / RLS with_check and silently failed — no estimate
-- or invoice email template has ever been successfully created. Add the same
-- default every other org-scoped table uses.
alter table crm_email_templates
  alter column org_id set default my_org_id();
