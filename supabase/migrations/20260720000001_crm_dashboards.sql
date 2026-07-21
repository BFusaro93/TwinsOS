-- CRM Report Center: saved dashboards (multi-tab panels of chart/table/KPI
-- "visuals" built on the same analysis engine as crm_custom_reports).
-- Whole layout stored as jsonb (tabs -> panels -> visual spec) — same
-- pattern as crm_custom_reports.config, since panels are inherently
-- nested/ordered and don't need their own relational tables.

create table if not exists crm_dashboards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id() references organizations(id),
  name text not null,
  description text,
  config jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table crm_dashboards enable row level security;

drop policy if exists "crm_dashboards_org" on crm_dashboards;
create policy "crm_dashboards_org" on crm_dashboards
  for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());
