-- Landscapt KPI Scorecard — a per-org, user-customizable scorecard whose
-- "auto" metrics are computed live from Landscapt data (clients, estimates,
-- invoices, payments, job visits, timesheets, employees) instead of the
-- legacy Twins-only sources behind /dashboards/kpis (kpi_actuals + AvB /
-- QBO / Samsara / crm_reports uploads). The legacy scorecard and its
-- kpi_actuals table are left untouched on purpose.
--
-- crm_kpi_scorecards        one row per org: the layout (categories ->
--                            metrics, weights, units, auto/manual source)
--                            stored as jsonb, same pattern as
--                            crm_dashboards.config.
-- crm_kpi_scorecard_entries per (scorecard, period, metric) targets and
--                            manually-entered actuals. Auto metrics only
--                            ever store a target here — their actual is
--                            recomputed on every load.

create table if not exists crm_kpi_scorecards (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id() references organizations(id),
  name text not null default 'KPI Scorecard',
  config jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One live scorecard per org (soft-deleted rows don't count).
create unique index if not exists crm_kpi_scorecards_org_live_uidx
  on crm_kpi_scorecards (org_id)
  where deleted_at is null;

alter table crm_kpi_scorecards enable row level security;

drop policy if exists "crm_kpi_scorecards_org" on crm_kpi_scorecards;
create policy "crm_kpi_scorecards_org" on crm_kpi_scorecards
  for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

drop trigger if exists crm_kpi_scorecards_set_updated_at on crm_kpi_scorecards;
create trigger crm_kpi_scorecards_set_updated_at
  before update on crm_kpi_scorecards
  for each row execute function set_updated_at();


create table if not exists crm_kpi_scorecard_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id() references organizations(id),
  scorecard_id uuid not null references crm_kpi_scorecards(id) on delete cascade,
  -- Calendar year the row belongs to, e.g. '2026' (matches kpi_actuals.period).
  period text not null,
  metric_key text not null,
  target_value numeric,
  actual_value numeric,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scorecard_id, period, metric_key)
);

create index if not exists crm_kpi_scorecard_entries_lookup_idx
  on crm_kpi_scorecard_entries (org_id, scorecard_id, period);

alter table crm_kpi_scorecard_entries enable row level security;

drop policy if exists "crm_kpi_scorecard_entries_org" on crm_kpi_scorecard_entries;
create policy "crm_kpi_scorecard_entries_org" on crm_kpi_scorecard_entries
  for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

drop trigger if exists crm_kpi_scorecard_entries_set_updated_at on crm_kpi_scorecard_entries;
create trigger crm_kpi_scorecard_entries_set_updated_at
  before update on crm_kpi_scorecard_entries
  for each row execute function set_updated_at();
