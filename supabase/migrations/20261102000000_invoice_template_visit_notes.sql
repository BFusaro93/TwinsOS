-- Invoice PDF templates can opt in to printing the technician's completion
-- note (crm_job_visits.completion_notes) from each invoiced visit in the
-- invoice's Notes section. Off by default so existing templates render
-- exactly as before; these notes are customer-facing once enabled.
alter table public.crm_invoice_pdf_templates
  add column if not exists show_visit_notes boolean not null default false;
