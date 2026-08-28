-- Scheduled email delivery of a pre-built report as a PDF, run daily by a
-- cron route. That route runs without a user session (service-role client,
-- which bypasses RLS entirely), so it must scope every query to the
-- schedule's own org explicitly — hence exposing org_id on rpt_job_visits
-- below. Appended at the end of the SELECT list, same reason as the
-- previous migration: CREATE OR REPLACE VIEW can't insert/reorder columns
-- mid-list without an explicit RENAME.
create or replace view rpt_job_visits
with (security_invoker = on) as
select
  v.id,
  v.scheduled_date,
  v.completed_at,
  v.status,
  v.sub_status,
  c.display_name as client_name,
  coalesce(s.service_name, (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id)) as service_names,
  cw.name as crew_name,
  nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') as sales_rep,
  coalesce(v.men_count, 1) as men_count,
  coalesce(v.budgeted_hours, s.budgeted_hours * s.team_size, j.budgeted_hours) as budgeted_hours,
  calc.actual_hours,
  calc.actual_hours as man_hours,
  coalesce(v.rate_cents, j.rate_cents) as rate_cents,
  calc.revenue_cents,
  v.actual_labor_cost_cents,
  case when calc.actual_hours > 0 then round(calc.revenue_cents::numeric / calc.actual_hours)::int else null end as rev_per_man_hr_cents,
  round(coalesce(v.budgeted_hours, s.budgeted_hours * s.team_size, j.budgeted_hours, 0) - coalesce(calc.actual_hours, 0), 2) as variance_hours,
  coalesce(j.service_city, c.service_city) as service_city,
  coalesce(j.service_zip, c.service_zip) as service_zip,
  v.skip_reason,
  v.clocked_in_at,
  v.clocked_out_at,
  (select string_agg(distinct js.budget_method, ', ')
     from crm_job_services js where js.job_id = j.id) as budget_methods,
  coalesce(cs.code, (select string_agg(csv.code, ', ' order by js2.sort_order)
     from crm_job_services js2
     join crm_services csv on csv.id = js2.service_id
     where js2.job_id = j.id and csv.code is not null)) as service_code,
  round(calc.revenue_cents::numeric / nullif(coalesce(v.budgeted_hours, s.budgeted_hours * s.team_size, j.budgeted_hours), 0))::int as budgeted_rev_per_man_hr_cents,
  v.org_id
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
left join crm_crews cw on cw.id = coalesce(v.crew_id, j.crew_id)
left join crm_employees sr on sr.id = j.sales_rep_id
left join crm_job_services s on s.id = v.job_service_id
left join crm_services cs on cs.id = s.service_id
cross join lateral (
  select
    coalesce(
      v.actual_hours,
      case when v.clocked_in_at is not null and v.clocked_out_at is not null and v.clocked_out_at > v.clocked_in_at
        then round(extract(epoch from v.clocked_out_at - v.clocked_in_at) / 3600.0, 2) * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        else null end,
      case when v.start_time is not null and v.end_time is not null and v.end_time > v.start_time
        then round(extract(epoch from v.end_time - v.start_time) / 3600.0, 2) * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        else null end
    ) as actual_hours,
    (coalesce(v.rate_cents, j.rate_cents, 0) * coalesce(nullif(v.qty, 0), 1))::int as revenue_cents
) calc
where v.deleted_at is null;

-- ── report_schedules ──────────────────────────────────────────────────────
-- One row = "email this pre-built report to these addresses every day."
-- `report_key` is validated against the code-defined report catalog
-- (PrebuiltReportDef.schedulable) at request time, not by a DB constraint —
-- the catalog can grow without a migration.
create table if not exists report_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null default my_org_id() references organizations(id),
  report_key text not null,
  recipients text[] not null default '{}',
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_run_status text check (last_run_status in ('success', 'error')),
  last_run_error text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists report_schedules_org_id_idx on report_schedules (org_id) where deleted_at is null;
alter table report_schedules enable row level security;

create policy "org members can manage report_schedules"
  on report_schedules for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
