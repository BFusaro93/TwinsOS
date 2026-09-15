-- The Chemical Tracking Report (rpt_chemical_applications) sourced
-- service_date/service_address exclusively from crm_jobs (j.scheduled_date,
-- j.service_address, ...). That works for one-time jobs, but recurring
-- and package jobs never populate crm_jobs.scheduled_date — the actual
-- date of each application lives on the crm_job_visits row instead
-- (crm_chemical_applications.visit_id -> crm_job_visits.scheduled_date).
--
-- Result: any chemical application logged against a recurring/package job
-- had a NULL service_date, so it silently disappeared from the report the
-- moment any date filter was applied (NULL never satisfies a date-range
-- comparison) — even "no filter at all" defaults to a date range. This
-- makes the compliance report look empty for orgs whose chemical jobs are
-- recurring/package (the common case), which is a real regulatory-record
-- problem, not just a cosmetic one.
--
-- Fix: coalesce service_date from the visit's scheduled_date when the job
-- itself has none.

create or replace view rpt_chemical_applications
with (security_invoker = on) as
select
  ca.id,
  coalesce(j.scheduled_date, v.scheduled_date) as service_date,
  c.display_name as client_name,
  j.service_address,
  j.service_city,
  j.service_state,
  j.service_zip,
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
