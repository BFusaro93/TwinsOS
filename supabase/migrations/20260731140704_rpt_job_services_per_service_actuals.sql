-- NOTE: rpt_job_services was found to have already been rewritten live on
-- prod (visit-grain: one row per crm_job_visits x crm_job_services pair,
-- with new visit_id/visit_status columns) by a concurrent change that
-- postdates the last committed migration for this view
-- (20260715000009_rpt_job_services_production_rate.sql, which is now stale
-- relative to what's deployed). This migration does NOT replace that
-- architecture — it applies one targeted fix on top of the live definition
-- (captured via pg_get_viewdef before making this change) and otherwise
-- reproduces it verbatim, so nothing else about its columns or join shape
-- changes here.
--
-- The fix: this view's `calc.actual_hours` coalesces an explicit
-- `v.actual_hours` override in with two derived (clock-diff / start-end)
-- tiers, then multiplies the RESULT by men_count uniformly. That's correct
-- for the two derived tiers (raw hours, need multiplying once) but wrong
-- for the override tier once anything writes an ALREADY men-multiplied
-- override — which crew/stops/[visitId]/clock-out now does (see
-- allocateStopHours() in src/lib/utils/visit-hours.ts), matching the
-- established convention elsewhere (computeActualHours(),
-- crm_recompute_job_actual_hours()) that an explicit override is never
-- re-multiplied downstream. Bake men_count into the two derived tiers
-- inside `calc` instead, so `calc.actual_hours` is consistently man-hours
-- across all three tiers, then stop multiplying it again afterward.
create or replace view rpt_job_services
with (security_invoker = on) as
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
  calc.actual_hours as job_actual_hours,
  coalesce(v.men_count, j.man_count, 1) as man_count,
  round(coalesce(calc.actual_hours, 0), 2) as actual_man_hours,
  case
    when calc.actual_hours > 0
    then round(jsv.qty / calc.actual_hours, 2)
  end as actual_production_rate,
  case
    when cs.production_rate_sqft_per_hr > 0 and calc.actual_hours > 0
    then round(
      (jsv.qty / calc.actual_hours - cs.production_rate_sqft_per_hr) / cs.production_rate_sqft_per_hr * 10000
    )::int
  end as rate_variance_bps
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
join crm_job_services jsv
  on (v.job_service_id is not null and jsv.id = v.job_service_id)
  or (v.job_service_id is null and jsv.job_id = v.job_id)
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
where v.deleted_at is null;

-- rpt_job_visits (a separate view — confirmed unmodified since the prior
-- migration in this working set, so this is a normal full replacement):
-- once batch stop clock-out (crew/stops/[visitId]/clock-out) writes an
-- already-men-multiplied actual_hours override, this view's old
-- `man_hours = calc.actual_hours * men_count` and the budgeted-vs-actual
-- variance (comparing a men-multiplied budget against a non-multiplied
-- actual) would double-count. Same fix as above: make every tier of
-- calc.actual_hours consistently men-multiplied, then man_hours is just an
-- alias (kept for saved-report column-name compatibility). Also fixes
-- service_names to show only the visit's own linked service instead of
-- every service on the job — the same scoping bug fixed client-side in
-- visitServices()/visit-stops.ts.
create or replace view rpt_job_visits
with (security_invoker = on) as
select
  v.id,
  v.scheduled_date,
  v.completed_at,
  v.status,
  v.sub_status,
  c.display_name as client_name,
  coalesce(
    s.service_name,
    (select string_agg(js.service_name, ', ' order by js.sort_order)
       from crm_job_services js where js.job_id = j.id)
  ) as service_names,
  cw.name as crew_name,
  sr.name as sales_rep,
  coalesce(v.men_count, 1) as men_count,
  coalesce(v.budgeted_hours, s.budgeted_hours * s.team_size, j.budgeted_hours) as budgeted_hours,
  calc.actual_hours,
  calc.actual_hours as man_hours,
  coalesce(v.rate_cents, j.rate_cents) as rate_cents,
  calc.revenue_cents,
  v.actual_labor_cost_cents,
  case
    when calc.actual_hours > 0
    then round(calc.revenue_cents / calc.actual_hours)::int
  end as rev_per_man_hr_cents,
  round(coalesce(v.budgeted_hours, s.budgeted_hours * s.team_size, j.budgeted_hours, 0) - coalesce(calc.actual_hours, 0), 2) as variance_hours,
  j.service_city,
  j.service_zip,
  v.skip_reason,
  v.clocked_in_at,
  v.clocked_out_at,
  (select string_agg(distinct js.budget_method, ', ')
     from crm_job_services js where js.job_id = j.id) as budget_methods
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
left join crm_crews cw on cw.id = coalesce(v.crew_id, j.crew_id)
left join profiles sr on sr.id = j.sales_rep_id
left join crm_job_services s on s.id = v.job_service_id
cross join lateral (
  select
    coalesce(
      v.actual_hours,
      case when v.clocked_in_at is not null and v.clocked_out_at is not null
            and v.clocked_out_at > v.clocked_in_at
        then round((extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0)::numeric, 2)
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
      end,
      case when v.start_time is not null and v.end_time is not null and v.end_time > v.start_time
        then round((extract(epoch from (v.end_time - v.start_time)) / 3600.0)::numeric, 2)
             * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
      end
    ) as actual_hours,
    (coalesce(v.rate_cents, j.rate_cents, 0) * coalesce(nullif(v.qty, 0), 1))::int as revenue_cents
) calc
where v.deleted_at is null;
