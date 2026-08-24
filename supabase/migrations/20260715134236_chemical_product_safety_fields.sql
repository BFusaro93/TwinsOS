-- Chemical Tracking phase 2: product-level safety/compliance fields
-- (active ingredients, re-entry interval, restricted-product flag),
-- the auto-calc area custom field link, and client notice email log.

-- ============================================================
-- 1. product_items: safety/compliance fields
-- ============================================================
-- active_ingredients mirrors the existing JSONB-on-parent-row pattern used by
-- product_items.alternate_vendors / cost_layers — a small repeatable list,
-- not worth a child table. Shape: [{ name: text, percentage: number }].

alter table public.product_items
  add column if not exists active_ingredients jsonb not null default '[]'::jsonb,
  add column if not exists re_entry_interval  text,
  add column if not exists restricted_product boolean not null default false;

-- ============================================================
-- 2. crm_chemical_settings: which property custom field drives auto-calc
-- ============================================================

alter table crm_chemical_settings
  add column if not exists area_custom_field_id uuid references crm_rate_matrix_field_defs(id) on delete set null;

-- ============================================================
-- 3. Client "Application Notice" email log — mirrors estimate_emails
-- ============================================================

create table if not exists crm_chemical_application_emails (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id),
  visit_id    uuid not null references crm_job_visits(id) on delete cascade,
  to_email    text not null,
  to_name     text,
  subject     text not null,
  body_html   text not null,
  sent_at     timestamptz not null default now(),
  resend_id   text,
  email_type  text not null default 'chemical_application'
);

create index on crm_chemical_application_emails (org_id, visit_id);

alter table crm_chemical_application_emails enable row level security;

create policy "org members can manage crm_chemical_application_emails"
  on crm_chemical_application_emails for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
