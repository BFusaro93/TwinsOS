-- rpt_chemical_applications already exposed solution_amount, but only ever
-- joined unit_of_measure_id (the chemical/concentrate amount's unit). Now
-- that crm_chemical_applications.solution_unit_of_measure_id lets a
-- solution amount carry its own unit — often different from the chemical's
-- (e.g. chemical in ounces, finished mix in gallons) — reusing the same
-- unit_of_measure column for both would misreport the solution amount's
-- actual unit.
-- Inserting solution_unit_of_measure in the middle of the column list shifts
-- every column after it, which CREATE OR REPLACE VIEW refuses ("cannot
-- change name of view column") — drop and recreate instead.
drop view if exists rpt_chemical_applications;

create view rpt_chemical_applications with (security_invoker = on) as
 SELECT ca.id,
    COALESCE(v.scheduled_date, (ca.application_start_time AT TIME ZONE 'America/New_York')::date, j.scheduled_date) AS service_date,
    c.display_name AS client_name,
    COALESCE(j.service_address, c.service_address) AS service_address,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_state, c.service_state) AS service_state,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    p.name AS chemical_name,
    COALESCE(ca.epa_number_snapshot, p.epa_registration_number) AS epa_registration_number,
    ca.epa_number_snapshot,
    COALESCE(ca.re_entry_interval_snapshot, p.re_entry_interval) AS re_entry_interval,
    COALESCE(ca.restricted_product_snapshot, p.restricted_product) AS restricted_product,
    ca.chemical_amount,
    ca.solution_amount,
    uom.name AS unit_of_measure,
    solution_uom.name AS solution_unit_of_measure,
    ca.application_rate_label,
    meth.name AS application_method,
    ca.temperature,
    ca.wind_speed,
    ca.wind_direction,
    ca.ph_level,
    ca.used,
    TRIM(BOTH FROM (COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text)) AS applicator_name,
    ca.applicator_license_number,
    ca.application_start_time,
    ca.application_end_time,
    ca.budgeted_concentrate_amount,
    ca.notes,
    ( SELECT string_agg(li.name, ', '::text ORDER BY li.name) AS string_agg
           FROM crm_chemical_lookup_items li
          WHERE li.id = ANY (ca.target_ids)) AS targets,
    ( SELECT string_agg(li.name, ', '::text ORDER BY li.name) AS string_agg
           FROM crm_chemical_lookup_items li
          WHERE li.id = ANY (ca.areas_treated_ids)) AS areas_treated
   FROM crm_chemical_applications ca
     JOIN crm_jobs j ON j.id = ca.job_id AND j.deleted_at IS NULL
     LEFT JOIN crm_job_visits v ON v.id = ca.visit_id AND v.deleted_at IS NULL
     JOIN clients c ON c.id = j.client_id AND c.deleted_at IS NULL
     LEFT JOIN product_items p ON p.id = ca.product_id
     LEFT JOIN crm_chemical_lookup_items uom ON uom.id = ca.unit_of_measure_id
     LEFT JOIN crm_chemical_lookup_items solution_uom ON solution_uom.id = ca.solution_unit_of_measure_id
     LEFT JOIN crm_chemical_lookup_items meth ON meth.id = ca.application_method_id
     LEFT JOIN crm_employees e ON e.id = ca.applicator_employee_id
  WHERE ca.deleted_at IS NULL;
