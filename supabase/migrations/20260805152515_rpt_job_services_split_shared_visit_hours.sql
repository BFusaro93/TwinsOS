-- rpt_job_services fans one visit out to one row per crm_job_services row
-- whenever v.job_service_id is null (an older/unlinked multi-service visit —
-- e.g. "Mowing" + "Edging" done together on one visit). Every fanned-out row
-- got the visit's FULL calc.actual_hours unchanged, as if each service
-- independently consumed the entire duration rather than sharing it — this
-- understated actual_production_rate and made rate_variance_bps look more
-- negative than reality for any such job, exactly the false "rate may be
-- set too aggressively" signal the Production Rate Accuracy report's own
-- tooltip warns about.
--
-- Fix: split calc.actual_hours proportionally by each service's own
-- budgeted_hours * team_size (same weighting allocateStopHours() uses for
-- stop clock-outs — src/lib/utils/visit-hours.ts), falling back to an even
-- split across the job's services if none have a budget set. A visit
-- already linked to exactly one service (job_service_id is not null) is
-- unaffected — its share is always 1.0.

create or replace view rpt_job_services
with (security_invoker = on) as
with service_weights as (
  select
    jsv.job_id,
    jsv.id as job_service_id,
    coalesce(jsv.budgeted_hours, 0) * coalesce(jsv.team_size, 1) as weight,
    sum(coalesce(jsv.budgeted_hours, 0) * coalesce(jsv.team_size, 1)) over (partition by jsv.job_id) as total_weight,
    count(*) over (partition by jsv.job_id) as service_count
  from crm_job_services jsv
)
select
  (v.id::text || '-'::text) || jsv.id::text as id,
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
  round(calc.actual_hours * shr.share, 2) as job_actual_hours,
  coalesce(v.men_count, j.man_count, 1) as man_count,
  round(coalesce(calc.actual_hours * shr.share, 0), 2) as actual_man_hours,
  case
    when calc.actual_hours * shr.share > 0
    then round(jsv.qty / (calc.actual_hours * shr.share), 2)
  end as actual_production_rate,
  case
    when cs.production_rate_sqft_per_hr > 0 and calc.actual_hours * shr.share > 0
    then round(
      (jsv.qty / (calc.actual_hours * shr.share) - cs.production_rate_sqft_per_hr) / cs.production_rate_sqft_per_hr * 10000
    )::int
  end as rate_variance_bps
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
join crm_job_services jsv
  on (v.job_service_id is not null and jsv.id = v.job_service_id)
  or (v.job_service_id is null and jsv.job_id = v.job_id)
join service_weights sw on sw.job_service_id = jsv.id
left join crm_services cs on cs.id = jsv.service_id
cross join lateral (
  select coalesce(
    v.actual_hours,
    case
      when v.clocked_in_at is not null and v.clocked_out_at is not null and v.clocked_out_at > v.clocked_in_at
      then round(extract(epoch from v.clocked_out_at - v.clocked_in_at) / 3600.0, 2) * coalesce(v.men_count, j.man_count, 1)
    end,
    case
      when v.start_time is not null and v.end_time is not null and v.end_time > v.start_time
      then round(extract(epoch from v.end_time - v.start_time) / 3600.0, 2) * coalesce(v.men_count, j.man_count, 1)
    end
  ) as actual_hours
) calc
cross join lateral (
  select
    case
      when v.job_service_id is not null then 1.0
      when sw.total_weight > 0 then sw.weight / sw.total_weight
      else 1.0 / sw.service_count
    end as share
) shr
where v.deleted_at is null;
