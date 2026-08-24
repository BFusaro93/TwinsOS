-- CRM Document Templates (email template builder)

create table if not exists crm_document_templates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  doc_type      text not null check (doc_type in ('client', 'estimate', 'invoice_email', 'marketing')),
  description   text,
  subject       text,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  is_default    boolean not null default false,
  include_pdf   boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  created_by    uuid references auth.users(id)
);

create table if not exists crm_document_blocks (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references crm_document_templates(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  block_type    text not null check (block_type in ('header','paragraph','list','divider','spacer','line_items','signature','image','button')),
  order_index   integer not null default 0,
  content       text,
  settings      jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- RLS
alter table crm_document_templates enable row level security;
alter table crm_document_blocks enable row level security;

create policy "crm_document_templates_org" on crm_document_templates
  for all using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "crm_document_blocks_org" on crm_document_blocks
  for all using (org_id = (select org_id from profiles where id = auth.uid()));

-- updated_at triggers
create or replace function update_crm_document_templates_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_crm_document_templates_updated_at
  before update on crm_document_templates
  for each row execute procedure update_crm_document_templates_updated_at();

create or replace function update_crm_document_blocks_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger trg_crm_document_blocks_updated_at
  before update on crm_document_blocks
  for each row execute procedure update_crm_document_blocks_updated_at();
