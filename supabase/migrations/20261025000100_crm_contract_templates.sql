-- Contract templates: saved starting points for the New Contract dialog (name, invoice
-- description lines, default service, monthly amounts, billing day, terms). Applying one fills the
-- form; nothing links a contract back to its template, so editing a template never changes
-- existing contracts.

create table if not exists public.crm_contract_templates (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null default my_org_id() references public.organizations(id),
  name                    text not null,
  title                   text not null default '',
  default_service         text,
  invoice_line_items      jsonb not null default '[]'::jsonb,
  monthly_amounts         jsonb not null default '{}'::jsonb,
  billing_day_of_month    integer not null default 1 check (billing_day_of_month between 1 and 31),
  bill_month_in_advance   boolean not null default false,
  payment_type            text,
  auto_generate           boolean not null default true,
  include_sub_properties  boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  deleted_at              timestamptz
);
create index if not exists idx_crm_contract_templates_org
  on public.crm_contract_templates (org_id) where deleted_at is null;

alter table public.crm_contract_templates enable row level security;

drop policy if exists "crm_contract_templates_select" on public.crm_contract_templates;
create policy "crm_contract_templates_select" on public.crm_contract_templates for select
  using (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_contract_templates_insert" on public.crm_contract_templates;
create policy "crm_contract_templates_insert" on public.crm_contract_templates for insert
  with check (org_id = my_org_id() and not public.is_client_portal_user());
drop policy if exists "crm_contract_templates_update" on public.crm_contract_templates;
create policy "crm_contract_templates_update" on public.crm_contract_templates for update
  using (org_id = my_org_id() and not public.is_client_portal_user())
  with check (org_id = my_org_id());

drop policy if exists "require_crm_access" on public.crm_contract_templates;
create policy "require_crm_access" on public.crm_contract_templates
  as restrictive for all using (public.has_crm_access()) with check (public.has_crm_access());

drop policy if exists "read_only_when_canceled_ins" on public.crm_contract_templates;
create policy "read_only_when_canceled_ins" on public.crm_contract_templates
  as restrictive for insert with check ((select public.my_org_is_read_only()) is not true);
drop policy if exists "read_only_when_canceled_upd" on public.crm_contract_templates;
create policy "read_only_when_canceled_upd" on public.crm_contract_templates
  as restrictive for update using ((select public.my_org_is_read_only()) is not true);

revoke all on public.crm_contract_templates from anon;
