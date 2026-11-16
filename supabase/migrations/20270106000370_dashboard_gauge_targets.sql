-- Dashboard gauge goals, per org.
--
-- The built-in dashboards shipped gauges with fixed goals ($4,000,000 invoiced
-- revenue YTD, 600 new leads, 300 new clients) that meant nothing for most
-- companies, and changing one meant editing the dashboard — an Advanced
-- Reporting feature. A goal is now its own small record per dashboard panel:
-- the viewer asks for it the first time a built-in gauge has none, and an
-- admin or anyone with Manage Report Center can change it later from the
-- gauge itself, on every plan.
--
-- target is in the gauge value's own unit (cents for money gauges, a count
-- for count gauges). Soft delete only; no delete policy.
--
-- Safe BEFORE the deploy (new table, unused by the old code).

create table if not exists public.crm_dashboard_gauge_targets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default public.my_org_id() references public.organizations(id),
  dashboard_id uuid not null references public.crm_dashboards(id),
  panel_id text not null check (length(panel_id) between 1 and 200),
  target numeric not null check (target > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_by uuid default auth.uid(),
  deleted_at timestamptz,
  unique (dashboard_id, panel_id)
);

create index if not exists crm_dashboard_gauge_targets_org_idx
  on public.crm_dashboard_gauge_targets (org_id);

alter table public.crm_dashboard_gauge_targets enable row level security;
revoke all on table public.crm_dashboard_gauge_targets from public, anon;
grant select, insert, update on table public.crm_dashboard_gauge_targets to authenticated;
grant all on table public.crm_dashboard_gauge_targets to service_role;

-- Everyone who can open the org's dashboards (crew included, for crew-visible
-- ones) sees the goals.
drop policy if exists crm_dashboard_gauge_targets_select on public.crm_dashboard_gauge_targets;
create policy crm_dashboard_gauge_targets_select on public.crm_dashboard_gauge_targets
  for select
  using (org_id = (select public.my_org_id()));

-- Admins (has_settings_permission passes them) and Manage Report Center
-- holders set goals — on a dashboard of their own org.
drop policy if exists crm_dashboard_gauge_targets_insert on public.crm_dashboard_gauge_targets;
create policy crm_dashboard_gauge_targets_insert on public.crm_dashboard_gauge_targets
  for insert
  with check (
    org_id = (select public.my_org_id())
    and (select public.has_settings_permission('manage_report_center'))
    and exists (
      select 1 from public.crm_dashboards d
       where d.id = dashboard_id and d.org_id = (select public.my_org_id()) and d.deleted_at is null
    )
  );

drop policy if exists crm_dashboard_gauge_targets_update on public.crm_dashboard_gauge_targets;
create policy crm_dashboard_gauge_targets_update on public.crm_dashboard_gauge_targets
  for update
  using (
    org_id = (select public.my_org_id())
    and (select public.has_settings_permission('manage_report_center'))
  )
  with check (
    org_id = (select public.my_org_id())
    and (select public.has_settings_permission('manage_report_center'))
    and exists (
      select 1 from public.crm_dashboards d
       where d.id = dashboard_id and d.org_id = (select public.my_org_id()) and d.deleted_at is null
    )
  );

-- Same restrictive layers the other CRM tables carry.
drop policy if exists require_crm_access on public.crm_dashboard_gauge_targets;
create policy require_crm_access on public.crm_dashboard_gauge_targets
  as restrictive
  for all
  using ((select public.has_crm_access()))
  with check ((select public.has_crm_access()));

drop policy if exists read_only_when_canceled_ins on public.crm_dashboard_gauge_targets;
create policy read_only_when_canceled_ins on public.crm_dashboard_gauge_targets
  as restrictive
  for insert
  with check ((select public.my_org_is_read_only()) is not true);

drop policy if exists read_only_when_canceled_upd on public.crm_dashboard_gauge_targets;
create policy read_only_when_canceled_upd on public.crm_dashboard_gauge_targets
  as restrictive
  for update
  using ((select public.my_org_is_read_only()) is not true)
  with check ((select public.my_org_is_read_only()) is not true);

notify pgrst, 'reload schema';
