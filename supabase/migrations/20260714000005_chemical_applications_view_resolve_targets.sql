-- rpt_chemical_applications didn't resolve target_ids/areas_treated_ids
-- (uuid[] columns on crm_chemical_applications) to readable names, but the
-- Chemical Tracking Report expects an "areas_treated" column — add both as
-- comma-joined lookup names.

create or replace view rpt_chemical_applications
with (security_invoker = on) as
select
  ca.id,
  j.scheduled_date as service_date,
  c.display_name as client_name,
  j.service_address,
  j.service_city,
  j.service_state,
  j.service_zip,
  p.name as chemical_name,
  p.epa_registration_number,
  ca.epa_number_snapshot,
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
join clients c on c.id = j.client_id and c.deleted_at is null
left join product_items p on p.id = ca.product_id
left join crm_chemical_lookup_items uom on uom.id = ca.unit_of_measure_id
left join crm_chemical_lookup_items meth on meth.id = ca.application_method_id
left join crm_employees e on e.id = ca.applicator_employee_id
where ca.deleted_at is null;
