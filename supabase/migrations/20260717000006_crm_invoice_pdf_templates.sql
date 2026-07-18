-- Invoice PDF templates: lets an org define multiple PDF layouts for invoices
-- (mirrors how estimates already generate real PDFs via @react-pdf/renderer,
-- instead of the old window.print() on a plain HTML page). layout_key selects
-- which React PDF component renders the invoice; more layouts can be added
-- later without a schema change.
create table if not exists crm_invoice_pdf_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id),
  name        text not null,
  layout_key  text not null default 'default',
  is_default  boolean not null default false,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references profiles(id)
);

create index on crm_invoice_pdf_templates (org_id) where deleted_at is null;

alter table crm_invoice_pdf_templates enable row level security;

create policy "org members can manage crm_invoice_pdf_templates"
  on crm_invoice_pdf_templates for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_invoice_pdf_templates_updated_at
  before update on crm_invoice_pdf_templates
  for each row execute function set_updated_at();

-- Only one default template per org.
create unique index crm_invoice_pdf_templates_one_default
  on crm_invoice_pdf_templates (org_id)
  where is_default and deleted_at is null;

-- Per-invoice override; null means "use the org's default template".
alter table crm_invoices
  add column if not exists pdf_template_id uuid references crm_invoice_pdf_templates(id) on delete set null;
