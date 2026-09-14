-- Adds actual_start_time / actual_stop_time (pre-formatted "h:mm AM/PM" text,
-- matching the legacy SA export's time columns) to rpt_job_visits, and an
-- hour_local column to report_schedules for the "what time of day" picker.
-- Appended at the end of the SELECT list — CREATE OR REPLACE VIEW can't
-- insert/reorder columns mid-list without an explicit RENAME.
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
  v.org_id,
  coalesce(
    to_char(v.clocked_in_at at time zone 'America/New_York', 'HH12:MI AM'),
    to_char(v.start_time, 'HH12:MI AM')
  ) as actual_start_time,
  coalesce(
    to_char(v.clocked_out_at at time zone 'America/New_York', 'HH12:MI AM'),
    to_char(v.end_time, 'HH12:MI AM')
  ) as actual_stop_time
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

-- What hour (America/New_York, 0-23) a schedule should run at. The cron
-- route polls hourly and compares against this, rather than the daily-only
-- noon-UTC run it started with.
alter table report_schedules add column if not exists hour_local smallint not null default 7
  check (hour_local between 0 and 23);
