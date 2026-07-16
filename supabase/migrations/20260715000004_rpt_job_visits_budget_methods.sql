-- Add budget_methods to rpt_job_visits so the existing Job Cost Summary /
-- Service Profitability reports can show which budgeting style (manual vs
-- production_rate) drove a visit's numbers, for auditing. Aggregated as a
-- distinct list (comma-separated) since one visit's job can have multiple
-- crm_job_services rows, potentially with different methods.
--
-- Recreated from the exact live view definition (confirmed via
-- pg_get_viewdef on prod) rather than the older migration file, which had
-- already drifted (missing completed_at/sub_status/sales-rep-via-profiles).

create or replace view rpt_job_visits
with (security_invoker = on) as
select
  v.id,
  v.scheduled_date,
  v.completed_at,
  v.status,
  v.sub_status,
  c.display_name as client_name,
  (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id) as service_names,
  cw.name as crew_name,
  sr.name as sales_rep,
  coalesce(v.men_count, 1) as men_count,
  coalesce(v.budgeted_hours, j.budgeted_hours) as budgeted_hours,
  calc.actual_hours,
  round(calc.actual_hours * coalesce(v.men_count, 1), 2) as man_hours,
  coalesce(v.rate_cents, j.rate_cents) as rate_cents,
  calc.revenue_cents,
  v.actual_labor_cost_cents,
  case
    when calc.actual_hours * coalesce(v.men_count, 1) > 0
    then round(calc.revenue_cents / (calc.actual_hours * coalesce(v.men_count, 1)))::int
  end as rev_per_man_hr_cents,
  round(coalesce(v.budgeted_hours, j.budgeted_hours, 0) - coalesce(calc.actual_hours, 0), 2) as variance_hours,
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
cross join lateral (
  select
    coalesce(
      v.actual_hours,
      case when v.clocked_in_at is not null and v.clocked_out_at is not null
        then round((extract(epoch from (v.clocked_out_at - v.clocked_in_at)) / 3600.0)::numeric, 2)
      end
    ) as actual_hours,
    (coalesce(v.rate_cents, j.rate_cents, 0) * coalesce(nullif(v.qty, 0), 1))::int as revenue_cents
) calc
where v.deleted_at is null;
