-- The Chemical Tracking Report (chemical-reports.ts) displays the
-- "epa_registration_number" column, which this view sourced from the LIVE
-- product_items join — not ca.epa_number_snapshot, which exists specifically
-- to freeze the EPA # at time-of-application. Correcting a product's EPA #
-- in the catalog later silently rewrote what the compliance report showed
-- for every PAST application of that product too, falsifying the
-- regulatory record. Same issue for re_entry_interval/restricted_product,
-- which the view never exposed a snapshot-aware version of at all.
--
-- epa_registration_number/re_entry_interval/restricted_product now coalesce
-- the snapshot first, falling back to the live product_items join only for
-- older rows saved before the snapshot columns existed (where the snapshot
-- is null and the live value is the best available approximation).

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
join clients c on c.id = j.client_id and c.deleted_at is null
left join product_items p on p.id = ca.product_id
left join crm_chemical_lookup_items uom on uom.id = ca.unit_of_measure_id
left join crm_chemical_lookup_items meth on meth.id = ca.application_method_id
left join crm_employees e on e.id = ca.applicator_employee_id
where ca.deleted_at is null;
