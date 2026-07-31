-- rpt_job_services was built at the crm_job_services grain and filtered on
-- the parent job's own status = 'completed'. That's the wrong signal for
-- recurring/package/project/snow jobs: those job types intentionally never
-- flip to job.status = 'completed' (see visits/[visitId]/complete/route.ts
-- terminalTypes — only one_time/waiting_list roll the job up). So a
-- recurring lawn-mowing job with dozens of completed visits over the season
-- never showed a single row here, while the actual completion signal
-- (crm_job_visits.status) was sitting right there un-consulted.
--
-- Rebuild at the crm_job_visits grain instead: one row per visit, joined
-- back to crm_job_services for the per-service qty/budgeted_hours/rate
-- fields that only exist there. A visit's job_service_id (set for
-- package/split visits) pins the join to exactly one service; when it's
-- null (recurring/unsplit visits) we join every service on that job, same
-- fan-out behavior the old job-grain view already had for multi-service
-- jobs sharing one totals row — no new ambiguity introduced, just correctly
-- keyed on the visit that actually happened.
--
-- `id` is now a synthetic "<visit_id>-<job_service_id>" key so it stays
-- unique per row even in that fan-out case (previously `id` was just the
-- job_service id, unique because there was one row per job_service). Callers
-- needing the raw ids get them via the new `visit_id`/`job_service_id`
-- columns. `job_status`/`is_complete` are kept for context (e.g. excluding
-- cancelled jobs) but callers wanting "did this happen" should filter the
-- new `visit_status` column, not `job_status`.
-- `create or replace view` can't change a column's type (id was uuid, now a
-- synthetic text key), so this has to drop and recreate rather than replace.
drop view if exists rpt_job_services;

create view rpt_job_services
with (security_invoker = on) as
select
  (v.id::text || '-' || jsv.id::text) as id,
  v.id as visit_id,
  jsv.id as job_service_id,
  v.job_id,
  j.status as job_status,
  j.is_complete,
  v.status as visit_status,
  v.scheduled_date,
  c.display_name as client_name,
  jsv.service_id,
  jsv.service_name,
  cs.category as service_category,
  cs.unit as service_unit,
  jsv.budget_method,
  cs.production_rate_sqft_per_hr as assumed_production_rate,
  jsv.qty,
  jsv.budgeted_hours,
  calc.actual_hours as job_actual_hours,
  coalesce(v.men_count, j.man_count, 1) as man_count,
  round(coalesce(calc.actual_hours, 0) * coalesce(v.men_count, j.man_count, 1), 2) as actual_man_hours,
  case
    when calc.actual_hours > 0 and coalesce(v.men_count, j.man_count, 1) > 0
    then round(jsv.qty / (calc.actual_hours * coalesce(v.men_count, j.man_count, 1)), 2)
  end as actual_production_rate,
  case
    when cs.production_rate_sqft_per_hr > 0 and calc.actual_hours > 0 and coalesce(v.men_count, j.man_count, 1) > 0
    then round(
      (
        (jsv.qty / (calc.actual_hours * coalesce(v.men_count, j.man_count, 1)) - cs.production_rate_sqft_per_hr)
        / cs.production_rate_sqft_per_hr
      ) * 10000
    )::int
  end as rate_variance_bps
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
join crm_job_services jsv on (
  (v.job_service_id is not null and jsv.id = v.job_service_id)
  or (v.job_service_id is null and jsv.job_id = v.job_id)
)
left join crm_services cs on cs.id = jsv.service_id
cross join lateral (
  select coalesce(
    v.actual_hours,
    case when v.clocked_in_at is not null and v.clocked_out_at is not null
      then round((extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0)::numeric, 2)
    end,
    case when v.start_time is not null and v.end_time is not null and v.end_time > v.start_time
      then round((extract(epoch from (v.end_time - v.start_time)) / 3600.0)::numeric, 2)
    end
  ) as actual_hours
) calc
where v.deleted_at is null;
