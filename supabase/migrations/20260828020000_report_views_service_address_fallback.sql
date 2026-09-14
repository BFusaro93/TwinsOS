-- rpt_jobs, rpt_job_visits, and rpt_chemical_applications all read
-- service_address/service_city/service_zip straight off crm_jobs. The app's
-- own read paths (use-crm-jobs.ts mapJob/mapJobListRow) never do that
-- directly — they fall back to the client's own service address whenever
-- the job has no address override:
--   service_address: row.service_address ?? row.clients?.billing_address ?? null
-- (clients also carries its own service_address/service_city/service_state/
-- service_zip columns — the property location, distinct from billing_*
-- which is only invoice/mailing address — and that's the more correct
-- fallback for a job's *service* location; clients has no billing_city
-- column at all).
--
-- Jobs created without an explicit service address (the common case — most
-- orgs don't override the client's own address) had a NULL service_address/
-- city/zip in crm_jobs, so every one of these report views rendered blank
-- location columns even though the client's own service address was right
-- there and the in-app job list would have shown it. This affected the
-- Visits Report, Daily Production, Job Cost Summary, Service Profitability
-- Summary (via rpt_job_visits), the Chemical Tracking Report (via
-- rpt_chemical_applications), and any other report built on rpt_jobs.
--
-- Bring the report views in line with the app's own fallback convention.

create or replace view rpt_jobs
with (security_invoker = on) as
select
  j.id,
  j.job_number,
  c.display_name as client_name,
  j.job_type,
  j.status,
  j.sub_status,
  j.scheduled_date,
  j.date_sold,
  j.source,
  nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') as sales_rep,
  cw.name as crew_name,
  (select string_agg(js.service_name, ', ' order by js.sort_order)
     from crm_job_services js where js.job_id = j.id) as service_names,
  j.man_count,
  j.rate_cents,
  j.budgeted_hours,
  j.actual_hours,
  j.service_total_cents,
  j.product_total_cents,
  j.tax_cents,
  j.total_cents,
  coalesce(j.service_address, c.service_address) as service_address,
  coalesce(j.service_city, c.service_city) as service_city,
  coalesce(j.service_zip, c.service_zip) as service_zip,
  j.package_name,
  (j.contract_id is not null) as under_contract,
  j.is_complete,
  j.created_at,
  c.primary_phone as client_phone,
  j.call_ahead
from crm_jobs j
join clients c on c.id = j.client_id and c.deleted_at is null
left join crm_crews cw on cw.id = j.crew_id
left join crm_employees sr on sr.id = j.sales_rep_id
where j.deleted_at is null;

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
     from crm_job_services js where js.job_id = j.id) as budget_methods
from crm_job_visits v
join crm_jobs j on j.id = v.job_id and j.deleted_at is null
join clients c on c.id = coalesce(v.client_id, j.client_id) and c.deleted_at is null
left join crm_crews cw on cw.id = coalesce(v.crew_id, j.crew_id)
left join crm_employees sr on sr.id = j.sales_rep_id
left join crm_job_services s on s.id = v.job_service_id
cross join lateral (
  select
    coalesce(
      v.actual_hours,
      case
        when v.clocked_in_at is not null and v.clocked_out_at is not null and v.clocked_out_at > v.clocked_in_at
          then round(extract(epoch from v.clocked_out_at - v.clocked_in_at) / 3600.0, 2) * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        else null
      end,
      case
        when v.start_time is not null and v.end_time is not null and v.end_time > v.start_time
          then round(extract(epoch from v.end_time - v.start_time) / 3600.0, 2) * case when coalesce(v.men_count, 0) = 0 then 1 else v.men_count end
        else null
      end
    ) as actual_hours,
    (coalesce(v.rate_cents, j.rate_cents, 0) * coalesce(nullif(v.qty, 0), 1))::int as revenue_cents
) calc
where v.deleted_at is null;

create or replace view rpt_chemical_applications
with (security_invoker = on) as
select
  ca.id,
  coalesce(j.scheduled_date, v.scheduled_date) as service_date,
  c.display_name as client_name,
  coalesce(j.service_address, c.service_address) as service_address,
  coalesce(j.service_city, c.service_city) as service_city,
  coalesce(j.service_state, c.service_state) as service_state,
  coalesce(j.service_zip, c.service_zip) as service_zip,
  p.name as chemical_name,
  coalesce(ca.epa_number_snapshot, p.epa_registration_number) as epa_registration_number,
  ca.epa_number_snapshot,
  coalesce(ca.re_entry_interval_snapshot, p.re_entry_interval) as re_entry_interval,
  coalesce(ca.restricted_product_snapshot, p.restricted_product) as restricted_product,
  ca.chemical_amount,
  ca.solution_amount,
  uom.name as unit_of_measure,
  ca.application_rate_label,
  meth.name as application_method,
  ca.temperature,
  ca.wind_speed,
  ca.wind_direction,
  ca.ph_level,
  ca.used,
  trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')) as applicator_name,
  ca.applicator_license_number,
  ca.application_start_time,
  ca.application_end_time,
  ca.budgeted_concentrate_amount,
  ca.notes,
  (select string_agg(li.name, ', ' order by li.name)
     from crm_chemical_lookup_items li
     where li.id = any(ca.target_ids)) as targets,
  (select string_agg(li.name, ', ' order by li.name)
     from crm_chemical_lookup_items li
     where li.id = any(ca.areas_treated_ids)) as areas_treated
from crm_chemical_applications ca
join crm_jobs j on j.id = ca.job_id and j.deleted_at is null
left join crm_job_visits v on v.id = ca.visit_id and v.deleted_at is null
join clients c on c.id = j.client_id and c.deleted_at is null
left join product_items p on p.id = ca.product_id
left join crm_chemical_lookup_items uom on uom.id = ca.unit_of_measure_id
left join crm_chemical_lookup_items meth on meth.id = ca.application_method_id
left join crm_employees e on e.id = ca.applicator_employee_id
where ca.deleted_at is null;
