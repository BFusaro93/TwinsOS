-- Chemical Tracking (compliance) report: add pre-combined display columns.
--
-- The report listed 26 separate columns — amount and unit apart, wind speed and
-- direction apart, applicator and licence apart — which is unreadable on a page
-- and overflowed the PDF. A state record wants the same facts, just grouped the
-- way an inspector reads them. These are appended to the view (existing columns
-- and their order are unchanged, so custom analyses keep working) and the
-- prebuilt report switches to them.
--
-- Body = 20261017120000 with six display columns appended.

create or replace view public.rpt_chemical_applications with (security_invoker = on) as
 SELECT ca.id,
    COALESCE(((ca.application_start_time AT TIME ZONE public.org_timezone(ca.org_id)))::date, v.scheduled_date, j.scheduled_date) AS service_date,
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
    TRIM(BOTH FROM ((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text))) AS applicator_name,
    ca.applicator_license_number,
    ca.application_start_time,
    ca.application_end_time,
    ca.budgeted_concentrate_amount,
    ca.notes,
    ( SELECT string_agg(li.name, ', '::text ORDER BY li.name) AS string_agg
           FROM crm_chemical_lookup_items li
          WHERE (li.id = ANY (ca.target_ids))) AS targets,
    ( SELECT string_agg(li.name, ', '::text ORDER BY li.name) AS string_agg
           FROM crm_chemical_lookup_items li
          WHERE (li.id = ANY (ca.areas_treated_ids))) AS areas_treated,
    -- ── display columns ──
    NULLIF(concat_ws(', ',
        NULLIF(COALESCE(j.service_address, c.service_address), ''),
        NULLIF(COALESCE(j.service_city, c.service_city), '')
    ), '') AS service_location,
    CASE WHEN ca.chemical_amount IS NULL THEN NULL
         ELSE concat_ws(' ',
              regexp_replace(regexp_replace(ca.chemical_amount::text, '(\.[0-9]*?)0+$', '\1'), '\.$', ''),
              uom.name)
    END AS chemical_applied,
    CASE WHEN ca.solution_amount IS NULL THEN NULL
         ELSE concat_ws(' ',
              regexp_replace(regexp_replace(ca.solution_amount::text, '(\.[0-9]*?)0+$', '\1'), '\.$', ''),
              solution_uom.name)
    END AS solution_applied,
    NULLIF(concat_ws(' · ',
        CASE WHEN ca.temperature IS NOT NULL
             THEN regexp_replace(regexp_replace(ca.temperature::text, '(\.[0-9]*?)0+$', '\1'), '\.$', '') || '°F' END,
        CASE WHEN ca.wind_speed IS NOT NULL OR NULLIF(ca.wind_direction, '') IS NOT NULL
             THEN 'wind ' || concat_ws(' ',
                  regexp_replace(regexp_replace(ca.wind_speed::text, '(\.[0-9]*?)0+$', '\1'), '\.$', ''),
                  NULLIF(ca.wind_direction, '')) END,
        CASE WHEN ca.ph_level IS NOT NULL
             THEN 'pH ' || regexp_replace(regexp_replace(ca.ph_level::text, '(\.[0-9]*?)0+$', '\1'), '\.$', '') END
    ), '') AS conditions,
    NULLIF(concat_ws(' ',
        NULLIF(TRIM(BOTH FROM ((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text))), ''),
        CASE WHEN ca.applicator_license_number IS NOT NULL THEN '(Lic. ' || ca.applicator_license_number || ')' END
    ), '') AS applicator,
    CASE WHEN ca.application_start_time IS NULL THEN NULL
         ELSE to_char(ca.application_start_time AT TIME ZONE public.org_timezone(ca.org_id), 'HH12:MI AM')
              || COALESCE(' – ' || to_char(ca.application_end_time AT TIME ZONE public.org_timezone(ca.org_id), 'HH12:MI AM'), '')
    END AS application_window
   FROM ((((((((crm_chemical_applications ca
     JOIN crm_jobs j ON (((j.id = ca.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN crm_job_visits v ON (((v.id = ca.visit_id) AND (v.deleted_at IS NULL))))
     JOIN clients c ON (((c.id = j.client_id) AND (c.deleted_at IS NULL))))
     LEFT JOIN product_items p ON ((p.id = ca.product_id)))
     LEFT JOIN crm_chemical_lookup_items uom ON ((uom.id = ca.unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items solution_uom ON ((solution_uom.id = ca.solution_unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items meth ON ((meth.id = ca.application_method_id)))
     LEFT JOIN crm_employees e ON ((e.id = ca.applicator_employee_id)))
  WHERE (ca.deleted_at IS NULL)
    AND (ca.visit_id IS NULL OR v.status IN ('in_progress', 'completed'));
