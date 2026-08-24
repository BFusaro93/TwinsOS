-- Real per-template configuration for invoice PDF templates. Previously
-- layout_key was the only knob (a picker between two hardcoded components);
-- this adds a logo/accent-color override and a notes-section toggle so a
-- template can actually look different from the org default.
alter table crm_invoice_pdf_templates
  add column if not exists logo_url     text,
  add column if not exists accent_color text,
  add column if not exists show_notes   boolean not null default true;
