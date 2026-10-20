-- Compliance record location ignored the job's linked property and billing address.
-- COALESCE(j.service_address, c.service_address) treats an empty-string job
-- address as present and skips client_properties entirely, so a multi-property
-- client's state record showed the client's default address (the wrong lawn) or
-- blank. Same order as resolveStopAddress: job snapshot, linked property,
-- client service address, billing address; whole tuple from ONE source so the
-- street never pairs with another source's city. Columns/types unchanged.
create or replace view public.rpt_chemical_applications with (security_invoker = on) as
 SELECT ca.id,
    COALESCE(((ca.application_start_time AT TIME ZONE org_timezone(ca.org_id)))::date, v.scheduled_date, j.scheduled_date) AS service_date,
    c.display_name AS client_name,
    CASE addr.src WHEN 1 THEN j.service_address WHEN 2 THEN cp.address WHEN 3 THEN c.service_address ELSE c.billing_address END AS service_address,
    CASE addr.src WHEN 1 THEN j.service_city WHEN 2 THEN cp.city WHEN 3 THEN c.service_city ELSE c.billing_city END AS service_city,
    CASE addr.src WHEN 1 THEN j.service_state WHEN 2 THEN cp.state WHEN 3 THEN c.service_state ELSE c.billing_state END AS service_state,
    CASE addr.src WHEN 1 THEN j.service_zip WHEN 2 THEN cp.zip WHEN 3 THEN c.service_zip ELSE c.billing_zip END AS service_zip,
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
    NULLIF(concat_ws(', '::text, NULLIF(CASE addr.src WHEN 1 THEN j.service_address WHEN 2 THEN cp.address WHEN 3 THEN c.service_address ELSE c.billing_address END, ''::text), NULLIF(CASE addr.src WHEN 1 THEN j.service_city WHEN 2 THEN cp.city WHEN 3 THEN c.service_city ELSE c.billing_city END, ''::text)), ''::text) AS service_location,
        CASE
            WHEN (ca.chemical_amount IS NULL) THEN NULL::text
            ELSE concat_ws(' '::text, regexp_replace(regexp_replace((ca.chemical_amount)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text), uom.name)
        END AS chemical_applied,
        CASE
            WHEN (ca.solution_amount IS NULL) THEN NULL::text
            ELSE concat_ws(' '::text, regexp_replace(regexp_replace((ca.solution_amount)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text), solution_uom.name)
        END AS solution_applied,
    NULLIF(concat_ws(' · '::text,
        CASE
            WHEN (ca.temperature IS NOT NULL) THEN (regexp_replace(regexp_replace((ca.temperature)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text) || '°F'::text)
            ELSE NULL::text
        END,
        CASE
            WHEN ((ca.wind_speed IS NOT NULL) OR (NULLIF(ca.wind_direction, ''::text) IS NOT NULL)) THEN ('wind '::text || concat_ws(' '::text, regexp_replace(regexp_replace((ca.wind_speed)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text), NULLIF(ca.wind_direction, ''::text)))
            ELSE NULL::text
        END,
        CASE
            WHEN (ca.ph_level IS NOT NULL) THEN ('pH '::text || regexp_replace(regexp_replace((ca.ph_level)::text, '(\.[0-9]*?)0+$'::text, '\1'::text), '\.$'::text, ''::text))
            ELSE NULL::text
        END), ''::text) AS conditions,
    NULLIF(concat_ws(' '::text, NULLIF(TRIM(BOTH FROM ((COALESCE(e.first_name, ''::text) || ' '::text) || COALESCE(e.last_name, ''::text))), ''::text),
        CASE
            WHEN (ca.applicator_license_number IS NOT NULL) THEN (('(Lic. '::text || ca.applicator_license_number) || ')'::text)
            ELSE NULL::text
        END), ''::text) AS applicator,
        CASE
            WHEN (ca.application_start_time IS NULL) THEN NULL::text
            ELSE (to_char((ca.application_start_time AT TIME ZONE org_timezone(ca.org_id)), 'HH12:MI AM'::text) || COALESCE((' – '::text || to_char((ca.application_end_time AT TIME ZONE org_timezone(ca.org_id)), 'HH12:MI AM'::text)), ''::text))
        END AS application_window
   FROM ((((((((((crm_chemical_applications ca
     JOIN crm_jobs j ON (((j.id = ca.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN crm_job_visits v ON (((v.id = ca.visit_id) AND (v.deleted_at IS NULL))))
     JOIN clients c ON (((c.id = j.client_id) AND (c.deleted_at IS NULL))))
     LEFT JOIN client_properties cp ON (((cp.id = j.property_id) AND (cp.deleted_at IS NULL))))
     CROSS JOIN LATERAL ( SELECT CASE WHEN (NULLIF(btrim(j.service_address), ''::text) IS NOT NULL) THEN 1 WHEN (NULLIF(btrim(cp.address), ''::text) IS NOT NULL) THEN 2 WHEN (NULLIF(btrim(c.service_address), ''::text) IS NOT NULL) THEN 3 ELSE 4 END AS src) addr)
     LEFT JOIN product_items p ON ((p.id = ca.product_id)))
     LEFT JOIN crm_chemical_lookup_items uom ON ((uom.id = ca.unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items solution_uom ON ((solution_uom.id = ca.solution_unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items meth ON ((meth.id = ca.application_method_id)))
     LEFT JOIN crm_employees e ON ((e.id = ca.applicator_employee_id)))
  WHERE ((ca.deleted_at IS NULL) AND ((ca.visit_id IS NULL) OR (v.status = ANY (ARRAY['in_progress'::text, 'completed'::text]))));
