-- Graphics Library: reusable, panel-level "graphics" (a single VisualSpec,
-- same shape as a dashboard panel's `visual`) that a user can save from any
-- dashboard panel and later drop into any other dashboard, new or existing.
-- Complements the code-defined system catalog (src/lib/reports/graphic-
-- templates.ts) — that one ships pre-made graphics in every org; this table
-- holds an org's own saved ones. Same org-scoped jsonb-blob pattern as
-- crm_custom_reports/crm_dashboards.

create table if not exists crm_saved_graphics (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id() references organizations(id),
  name text not null,
  description text,
  category text,
  visual jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table crm_saved_graphics enable row level security;

drop policy if exists "crm_saved_graphics_org" on crm_saved_graphics;
create policy "crm_saved_graphics_org" on crm_saved_graphics
  for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());
