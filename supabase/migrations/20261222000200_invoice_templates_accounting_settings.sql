-- Invoice PDF/email templates were writable by any org member with CRM access
-- (one FOR ALL policy, org_id only) — including crew and sales logins. The
-- template's accent_color and logo_url are interpolated into every client's
-- invoice email, so a single PATCH could plant a link in all of them (the email
-- routes now also validate/escape those values). Reads stay org-wide (every
-- invoice render and the email/print dialogs read the templates); writes need
-- accounting_settings, the key that gates Settings → Accounting → Invoice Templates.

drop policy if exists "org members can manage crm_invoice_pdf_templates" on public.crm_invoice_pdf_templates;
drop policy if exists "org members read crm_invoice_pdf_templates" on public.crm_invoice_pdf_templates;
drop policy if exists "settings_permission_insert_invoice_templates" on public.crm_invoice_pdf_templates;
drop policy if exists "settings_permission_update_invoice_templates" on public.crm_invoice_pdf_templates;
drop policy if exists "settings_permission_delete_invoice_templates" on public.crm_invoice_pdf_templates;

create policy "org members read crm_invoice_pdf_templates" on public.crm_invoice_pdf_templates
  for select
  using (org_id = public.my_org_id());

create policy "settings_permission_insert_invoice_templates" on public.crm_invoice_pdf_templates
  for insert
  with check (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));

create policy "settings_permission_update_invoice_templates" on public.crm_invoice_pdf_templates
  for update
  using (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'))
  with check (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));

create policy "settings_permission_delete_invoice_templates" on public.crm_invoice_pdf_templates
  for delete
  using (org_id = public.my_org_id() and public.has_settings_permission('accounting_settings'));
