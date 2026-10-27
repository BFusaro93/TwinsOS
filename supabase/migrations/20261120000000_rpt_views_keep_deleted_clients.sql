-- Reports: keep records of soft-deleted clients.
--
-- Most operational rpt_* views INNER JOINed clients with `deleted_at IS NULL`,
-- so soft-deleting a client silently removed every job, visit, estimate,
-- contract and chemical application from report totals (labor cost, revenue,
-- hours) while rpt_payments / rpt_invoices (see 20261111010100) still counted
-- them. They now LEFT JOIN clients without the deleted_at filter; a deleted
-- client's name is shown with a " (deleted)" suffix. rpt_tickets, rpt_timesheets
-- and rpt_projects_wip already LEFT JOINed but blanked the name; rpt_upsells
-- only gets the label. Column lists/types, security_invoker and grants are
-- unchanged (CREATE OR REPLACE keeps grants). Definitions taken from the live
-- schema.
--
-- rpt_client_activity / rpt_client_contacts / rpt_clients /
-- rpt_address_verification are client-centric lists and intentionally still
-- hide deleted clients.

create or replace view public.rpt_chemical_applications
with (security_invoker = on) as
SELECT ca.id,
    COALESCE(((ca.application_start_time AT TIME ZONE org_timezone(ca.org_id)))::date, v.scheduled_date, j.scheduled_date) AS service_date,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
        CASE addr.src
            WHEN 1 THEN j.service_address
            WHEN 2 THEN cp.address
            WHEN 3 THEN c.service_address
            ELSE c.billing_address
        END AS service_address,
        CASE addr.src
            WHEN 1 THEN j.service_city
            WHEN 2 THEN cp.city
            WHEN 3 THEN c.service_city
            ELSE c.billing_city
        END AS service_city,
        CASE addr.src
            WHEN 1 THEN j.service_state
            WHEN 2 THEN cp.state
            WHEN 3 THEN c.service_state
            ELSE c.billing_state
        END AS service_state,
        CASE addr.src
            WHEN 1 THEN j.service_zip
            WHEN 2 THEN cp.zip
            WHEN 3 THEN c.service_zip
            ELSE c.billing_zip
        END AS service_zip,
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
    NULLIF(concat_ws(', '::text, NULLIF(
        CASE addr.src
            WHEN 1 THEN j.service_address
            WHEN 2 THEN cp.address
            WHEN 3 THEN c.service_address
            ELSE c.billing_address
        END, ''::text), NULLIF(
        CASE addr.src
            WHEN 1 THEN j.service_city
            WHEN 2 THEN cp.city
            WHEN 3 THEN c.service_city
            ELSE c.billing_city
        END, ''::text)), ''::text) AS service_location,
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
     LEFT JOIN clients c ON ((c.id = j.client_id)))
     LEFT JOIN client_properties cp ON (((cp.id = j.property_id) AND (cp.deleted_at IS NULL))))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (NULLIF(btrim(j.service_address), ''::text) IS NOT NULL) THEN 1
                    WHEN (NULLIF(btrim(cp.address), ''::text) IS NOT NULL) THEN 2
                    WHEN (NULLIF(btrim(c.service_address), ''::text) IS NOT NULL) THEN 3
                    ELSE 4
                END AS src) addr)
     LEFT JOIN product_items p ON ((p.id = ca.product_id)))
     LEFT JOIN crm_chemical_lookup_items uom ON ((uom.id = ca.unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items solution_uom ON ((solution_uom.id = ca.solution_unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items meth ON ((meth.id = ca.application_method_id)))
     LEFT JOIN crm_employees e ON ((e.id = ca.applicator_employee_id)))
  WHERE ((ca.deleted_at IS NULL) AND ((NOT ca.preloaded) OR (ca.confirmed_at IS NOT NULL)) AND ((ca.visit_id IS NULL) OR (v.status = ANY (ARRAY['in_progress'::text, 'completed'::text]))));

create or replace view public.rpt_contract_service_usage
with (security_invoker = on) as
SELECT cs.id,
    cs.org_id,
    cs.contract_id,
    ct.title AS contract_title,
    ct.status AS contract_status,
    ct.start_date AS contract_start_date,
    ct.end_date AS contract_end_date,
    (CASE WHEN cl.deleted_at IS NOT NULL THEN cl.display_name || ' (deleted)' ELSE cl.display_name END) AS client_name,
    cs.service_name,
    cs.visits_included,
    COALESCE(usage.visits_used, (0)::bigint) AS visits_used,
    (cs.visits_included - COALESCE(usage.visits_used, (0)::bigint)) AS visits_remaining,
    (COALESCE(usage.visits_used, (0)::bigint) > cs.visits_included) AS is_over
   FROM (((crm_contract_services cs
     JOIN crm_contracts ct ON (((ct.id = cs.contract_id) AND (ct.deleted_at IS NULL))))
     LEFT JOIN clients cl ON ((cl.id = ct.client_id)))
     LEFT JOIN LATERAL ( SELECT count(*) AS visits_used
           FROM ((crm_job_visits v
             JOIN crm_job_services js ON ((js.id = v.job_service_id)))
             JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
          WHERE ((j.contract_id = cs.contract_id) AND (v.status = 'completed'::text) AND (v.deleted_at IS NULL) AND (NOT v.crew_group_secondary) AND (((cs.service_id IS NOT NULL) AND (js.service_id = cs.service_id)) OR ((cs.service_id IS NULL) AND (js.service_id IS NULL) AND (js.service_name = cs.service_name))))) usage ON (true))
  WHERE (cs.deleted_at IS NULL);

create or replace view public.rpt_contracts
with (security_invoker = on) as
SELECT k.id,
    k.title,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    k.status,
    k.start_date,
    k.end_date,
    k.monthly_amount_cents,
    k.billing_frequency,
    k.billing_day_of_month,
    k.is_active,
    k.auto_generate,
    k.last_billed_date,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    k.source,
    k.created_at
   FROM ((crm_contracts k
     LEFT JOIN clients c ON ((c.id = k.client_id)))
     LEFT JOIN crm_employees sr ON ((sr.id = k.sales_rep_id)))
  WHERE (k.deleted_at IS NULL);

create or replace view public.rpt_estimate_line_items
with (security_invoker = on) as
SELECT li.id,
    e.estimate_number,
    e.estimate_date,
    e.stage AS estimate_stage,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    li.service_name,
    li.status,
    li.qty,
    li.rate_cents,
    li.visits,
    li.budgeted_hours,
    li.total_budgeted_hours,
    li.cost_cents,
    li.total_cost_cents,
    li.total_cents,
    round(((COALESCE(li.margin_bps, 0))::numeric / 100.0), 1) AS margin_pct
   FROM (((estimate_line_items li
     JOIN estimates e ON (((e.id = li.estimate_id) AND (e.deleted_at IS NULL))))
     LEFT JOIN clients c ON ((c.id = e.client_id)))
     LEFT JOIN crm_employees sr ON ((sr.id = e.sales_rep_id)))
  WHERE ((li.deleted_at IS NULL) AND (COALESCE(li.row_type, 'line'::text) <> ALL (ARRAY['section'::text, 'text'::text])));

create or replace view public.rpt_estimates
with (security_invoker = on) as
SELECT e.id,
    e.estimate_number,
    e.estimate_date,
    e.valid_until_date,
    e.stage,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    c.status AS client_status,
    COALESCE(e.source, c.source) AS source,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    e.description,
    e.subtotal_cents,
    e.discount_cents,
    e.tax_cents,
    e.total_cents,
    e.gross_profit_cents,
    e.net_profit_cents,
    e.total_budgeted_hours,
    round(((COALESCE(e.probability_bps, 0))::numeric / 100.0), 1) AS probability_pct,
    e.reason,
    (((now() AT TIME ZONE org_timezone(e.org_id)))::date - e.estimate_date) AS age_days,
    e.created_at,
    e.updated_at
   FROM ((estimates e
     LEFT JOIN clients c ON ((c.id = e.client_id)))
     LEFT JOIN crm_employees sr ON ((sr.id = e.sales_rep_id)))
  WHERE (e.deleted_at IS NULL);

create or replace view public.rpt_job_services
with (security_invoker = on) as
WITH service_weights AS (
         SELECT jsv_1.job_id,
            jsv_1.id AS job_service_id,
            (COALESCE(jsv_1.budgeted_hours, (0)::numeric) * (COALESCE(jsv_1.team_size, 1))::numeric) AS weight,
            sum((COALESCE(jsv_1.budgeted_hours, (0)::numeric) * (COALESCE(jsv_1.team_size, 1))::numeric)) OVER (PARTITION BY jsv_1.job_id) AS total_weight,
                CASE
                    WHEN COALESCE(jsv_1.included, true) THEN ((COALESCE(jsv_1.rate_cents, 0))::numeric * COALESCE(NULLIF(jsv_1.qty, (0)::numeric), (1)::numeric))
                    ELSE (0)::numeric
                END AS rev_weight,
            sum(
                CASE
                    WHEN COALESCE(jsv_1.included, true) THEN ((COALESCE(jsv_1.rate_cents, 0))::numeric * COALESCE(NULLIF(jsv_1.qty, (0)::numeric), (1)::numeric))
                    ELSE (0)::numeric
                END) OVER (PARTITION BY jsv_1.job_id) AS total_rev_weight,
            count(*) OVER (PARTITION BY jsv_1.job_id) AS service_count
           FROM crm_job_services jsv_1
        )
 SELECT (((v.id)::text || '-'::text) || (jsv.id)::text) AS id,
    v.id AS visit_id,
    jsv.id AS job_service_id,
    v.job_id,
    j.status AS job_status,
    j.is_complete,
    v.status AS visit_status,
    v.scheduled_date,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    jsv.service_id,
    jsv.service_name,
    cs.category AS service_category,
    cs.unit AS service_unit,
    jsv.budget_method,
    cs.production_rate_sqft_per_hr AS assumed_production_rate,
    jsv.qty,
    (jsv.budgeted_hours * (COALESCE(jsv.team_size, 1))::numeric) AS budgeted_hours,
        CASE
            WHEN v.crew_group_secondary THEN 0
            ELSE
            CASE
                WHEN COALESCE(jsv.included, true) THEN (round(((COALESCE(jsv.rate_cents, 0))::numeric * COALESCE(NULLIF(jsv.qty, (0)::numeric), (1)::numeric))))::integer
                ELSE 0
            END
        END AS line_revenue_cents,
    round(shr.share, 4) AS revenue_share,
    round((calc.actual_hours * shr.share), 2) AS job_actual_hours,
        CASE
            WHEN (COALESCE(v.men_count, j.man_count, 0) = 0) THEN 1
            ELSE COALESCE(v.men_count, j.man_count)
        END AS man_count,
    round(COALESCE((calc.actual_hours * shr.share), (0)::numeric), 2) AS actual_man_hours,
        CASE
            WHEN ((pr.hours * shr.share) > (0)::numeric) THEN round((jsv.qty / (pr.hours * shr.share)), 2)
            ELSE NULL::numeric
        END AS actual_production_rate,
        CASE
            WHEN ((cs.production_rate_sqft_per_hr > (0)::numeric) AND ((pr.hours * shr.share) > (0)::numeric)) THEN (round(((((jsv.qty / (pr.hours * shr.share)) - cs.production_rate_sqft_per_hr) / cs.production_rate_sqft_per_hr) * (10000)::numeric)))::integer
            ELSE NULL::integer
        END AS rate_variance_bps
   FROM ((((((((crm_job_visits v
     JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN clients c ON ((c.id = COALESCE(v.client_id, j.client_id))))
     JOIN crm_job_services jsv ON ((((v.job_service_id IS NOT NULL) AND (jsv.id = v.job_service_id)) OR ((v.job_service_id IS NULL) AND (jsv.job_id = v.job_id)))))
     JOIN service_weights sw ON ((sw.job_service_id = jsv.id)))
     LEFT JOIN crm_services cs ON ((cs.id = jsv.service_id)))
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN ((v.clocked_in_at IS NOT NULL) AND (v.clocked_out_at IS NOT NULL) AND (v.clocked_out_at > v.clocked_in_at)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.clocked_out_at - v.clocked_in_at)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, j.man_count, 0) = 0) THEN 1
                        ELSE COALESCE(v.men_count, j.man_count)
                    END)::numeric)
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN ((v.start_time IS NOT NULL) AND (v.end_time IS NOT NULL) AND (v.end_time <> v.start_time)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM
                    CASE
                        WHEN (v.end_time > v.start_time) THEN (v.end_time - v.start_time)
                        ELSE ((v.end_time + '24:00:00'::interval) - v.start_time)
                    END) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, j.man_count, 0) = 0) THEN 1
                        ELSE COALESCE(v.men_count, j.man_count)
                    END)::numeric)
                    ELSE NULL::numeric
                END) AS actual_hours) calc)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (v.job_service_id IS NOT NULL) THEN 1.0
                    WHEN (sw.total_rev_weight > (0)::numeric) THEN (sw.rev_weight / sw.total_rev_weight)
                    WHEN (sw.total_weight > (0)::numeric) THEN (sw.weight / sw.total_weight)
                    ELSE (1.0 / (sw.service_count)::numeric)
                END AS share) shr)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN v.crew_group_secondary THEN NULL::numeric
                    WHEN (v.crew_group_id IS NULL) THEN calc.actual_hours
                    ELSE ( SELECT
                            CASE
                                WHEN bool_or((g.actual_hours IS NULL)) THEN NULL::numeric
                                ELSE sum(g.actual_hours)
                            END AS sum
                       FROM crm_job_visits g
                      WHERE ((g.crew_group_id = v.crew_group_id) AND (g.deleted_at IS NULL) AND (g.status <> ALL (ARRAY['cancelled'::text, 'skipped'::text]))))
                END AS hours) pr)
  WHERE (v.deleted_at IS NULL);

create or replace view public.rpt_job_visits
with (security_invoker = on) as
WITH member_rates AS (
         SELECT r.org_id,
            r.crew_id,
            r.rate
           FROM rpt_crew_member_labor_rates() r(org_id, crew_id, rate)
        )
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    COALESCE(((v.completed_at AT TIME ZONE org_timezone(v.org_id)))::date, v.scheduled_date) AS worked_date,
    v.status,
    v.sub_status,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    COALESCE(s.service_name, ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id))) AS service_names,
    cw.name AS crew_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    (COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    calc.rate_cents,
        CASE
            WHEN v.crew_group_secondary THEN 0
            ELSE calc.revenue_cents
        END AS revenue_cents,
    labor.labor_cost_cents AS actual_labor_cost_cents,
    labor.labor_cost_source,
        CASE
            WHEN (calc.actual_hours > (0)::numeric) THEN (round(((
            CASE
                WHEN v.crew_group_secondary THEN 0
                ELSE calc.revenue_cents
            END)::numeric / calc.actual_hours)))::bigint
            ELSE NULL::bigint
        END AS rev_per_man_hr_cents,
        CASE
            WHEN (((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) IS NOT NULL) AND (calc.actual_hours IS NOT NULL)) THEN round(((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) - calc.actual_hours), 2)
            ELSE NULL::numeric
        END AS variance_hours,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    v.skip_reason,
    v.clocked_in_at,
    v.clocked_out_at,
    ( SELECT string_agg(DISTINCT js.budget_method, ', '::text) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id)) AS budget_methods,
    COALESCE(cs.code, ( SELECT string_agg(csv.code, ', '::text ORDER BY js2.sort_order) AS string_agg
           FROM (crm_job_services js2
             JOIN crm_services csv ON ((csv.id = js2.service_id)))
          WHERE ((js2.job_id = j.id) AND (csv.code IS NOT NULL)))) AS service_code,
    (round(((
        CASE
            WHEN v.crew_group_secondary THEN 0
            ELSE calc.revenue_cents
        END)::numeric / NULLIF((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n), (0)::numeric))))::bigint AS budgeted_rev_per_man_hr_cents,
    v.org_id,
    COALESCE(to_char((v.clocked_in_at AT TIME ZONE org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.start_time)::interval, 'HH12:MI AM'::text)) AS actual_start_time,
    COALESCE(to_char((v.clocked_out_at AT TIME ZONE org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.end_time)::interval, 'HH12:MI AM'::text)) AS actual_stop_time,
    v.crew_group_id,
    v.crew_group_secondary
   FROM ((((((((((crm_job_visits v
     JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN clients c ON ((c.id = COALESCE(v.client_id, j.client_id))))
     LEFT JOIN crm_crews cw ON ((cw.id =
        CASE
            WHEN v.crew_unassigned THEN NULL::uuid
            ELSE COALESCE(v.crew_id, j.crew_id)
        END)))
     LEFT JOIN crm_employees sr ON ((sr.id = j.sales_rep_id)))
     LEFT JOIN crm_job_services s ON ((s.id = v.job_service_id)))
     LEFT JOIN crm_services cs ON ((cs.id = s.service_id)))
     CROSS JOIN LATERAL ( SELECT (sum(js.rate_cents))::integer AS rate_sum_cents,
            (sum(((js.rate_cents)::numeric * COALESCE(NULLIF(js.qty, (0)::numeric), (1)::numeric))))::integer AS revenue_sum_cents
           FROM crm_job_services js
          WHERE ((js.job_id = j.id) AND COALESCE(js.included, true))) svc_sum)
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN ((v.clocked_in_at IS NOT NULL) AND (v.clocked_out_at IS NOT NULL) AND (v.clocked_out_at > v.clocked_in_at)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.clocked_out_at - v.clocked_in_at)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN ((v.start_time IS NOT NULL) AND (v.end_time IS NOT NULL) AND (v.end_time <> v.start_time)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM
                    CASE
                        WHEN (v.end_time > v.start_time) THEN (v.end_time - v.start_time)
                        ELSE ((v.end_time + '24:00:00'::interval) - v.start_time)
                    END) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END) AS actual_hours,
                CASE
                    WHEN (v.job_service_id IS NOT NULL) THEN COALESCE((((v.rate_cents)::numeric * COALESCE(NULLIF(v.qty, (0)::numeric), (1)::numeric)))::integer, (((s.rate_cents)::numeric * COALESCE(NULLIF(s.qty, (0)::numeric), (1)::numeric)))::integer, 0)
                    ELSE COALESCE(svc_sum.revenue_sum_cents, (((v.rate_cents)::numeric * COALESCE(NULLIF(v.qty, (0)::numeric), (1)::numeric)))::integer, j.rate_cents, 0)
                END AS revenue_cents,
                CASE
                    WHEN (v.job_service_id IS NOT NULL) THEN COALESCE(v.rate_cents, s.rate_cents)
                    ELSE COALESCE(svc_sum.rate_sum_cents, v.rate_cents, j.rate_cents)
                END AS rate_cents) calc)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (COALESCE(v.actual_labor_cost_cents, 0) > 0) THEN v.actual_labor_cost_cents
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN (round((calc.actual_hours * COALESCE(rates.crew_rate, rates.org_rate))))::integer
                    ELSE 0
                END AS labor_cost_cents,
                CASE
                    WHEN (COALESCE(v.actual_labor_cost_cents, 0) > 0) THEN 'actual'::text
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN 'estimated'::text
                    ELSE 'none'::text
                END AS labor_cost_source
           FROM ( SELECT ( SELECT avg(m.rate) AS avg
                           FROM member_rates m
                          WHERE ((m.crew_id =
                                CASE
                                    WHEN v.crew_unassigned THEN NULL::uuid
                                    ELSE COALESCE(v.crew_id, j.crew_id)
                                END) AND (m.rate > (0)::numeric))) AS crew_rate,
                    ( SELECT avg(m.rate) AS avg
                           FROM member_rates m
                          WHERE ((m.org_id = v.org_id) AND (m.rate > (0)::numeric))) AS org_rate) rates) labor)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (v.crew_group_id IS NULL) THEN (1)::numeric
                    ELSE GREATEST((1)::numeric, (( SELECT count(*) AS count
                       FROM crm_job_visits g
                      WHERE ((g.crew_group_id = v.crew_group_id) AND (g.deleted_at IS NULL) AND (g.status <> 'cancelled'::text))))::numeric)
                END AS n) grp)
  WHERE (v.deleted_at IS NULL);

create or replace view public.rpt_jobs
with (security_invoker = on) as
SELECT j.id,
    j.job_number,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    j.job_type,
    j.status,
    j.sub_status,
    j.scheduled_date,
    j.date_sold,
    j.source,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    cw.name AS crew_name,
    ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id)) AS service_names,
    j.man_count,
    j.rate_cents,
    j.budgeted_hours,
    j.actual_hours,
    j.service_total_cents,
    j.product_total_cents,
    j.tax_cents,
    j.total_cents,
    COALESCE(j.service_address, c.service_address) AS service_address,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    j.package_name,
    (j.contract_id IS NOT NULL) AS under_contract,
    j.is_complete,
    j.created_at,
    c.primary_phone AS client_phone,
    j.call_ahead
   FROM (((crm_jobs j
     LEFT JOIN clients c ON ((c.id = j.client_id)))
     LEFT JOIN crm_crews cw ON ((cw.id = j.crew_id)))
     LEFT JOIN crm_employees sr ON ((sr.id = j.sales_rep_id)))
  WHERE (j.deleted_at IS NULL);

create or replace view public.rpt_projects_wip
with (security_invoker = on) as
SELECT p.id,
    p.name,
    p.status,
    COALESCE((CASE WHEN cl.deleted_at IS NOT NULL THEN cl.display_name || ' (deleted)' ELSE cl.display_name END), p.customer_name) AS client_name,
    p.contract_price AS contract_cents,
    p.estimated_cost_cents AS eac_cents,
    (p.contract_price - p.estimated_cost_cents) AS estimated_gp_cents,
        CASE
            WHEN (p.contract_price > 0) THEN round(((((p.contract_price - p.estimated_cost_cents))::numeric / (p.contract_price)::numeric) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS estimated_gp_pct,
    cost.cost_to_date_cents,
        CASE
            WHEN (p.estimated_cost_cents > 0) THEN round(((LEAST(cost.cost_to_date_cents, (p.estimated_cost_cents)::numeric) / (p.estimated_cost_cents)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS pct_complete,
    (round(((p.contract_price)::numeric *
        CASE
            WHEN (p.estimated_cost_cents > 0) THEN (LEAST(cost.cost_to_date_cents, (p.estimated_cost_cents)::numeric) / (p.estimated_cost_cents)::numeric)
            ELSE (0)::numeric
        END)))::integer AS earned_revenue_cents,
    COALESCE(bill.billed_cents, (0)::bigint) AS billed_cents,
    (COALESCE(bill.billed_cents, (0)::bigint) - (round(((p.contract_price)::numeric *
        CASE
            WHEN (p.estimated_cost_cents > 0) THEN (LEAST(cost.cost_to_date_cents, (p.estimated_cost_cents)::numeric) / (p.estimated_cost_cents)::numeric)
            ELSE (0)::numeric
        END)))::integer) AS over_under_billed_cents,
    (p.contract_price - COALESCE(bill.billed_cents, (0)::bigint)) AS remaining_to_bill_cents,
    p.start_date,
    p.end_date,
    p.created_at,
    p.original_contract_price AS original_contract_cents,
    COALESCE(co.approved_change_cents, (0)::bigint) AS approved_changes_cents,
    COALESCE(co.change_order_count, (0)::bigint) AS change_order_count
   FROM ((((((((projects p
     LEFT JOIN clients cl ON ((cl.id = p.client_id)))
     LEFT JOIN LATERAL ( SELECT (((COALESCE(sum(pli.total_cost), (0)::bigint))::numeric + COALESCE(sum(
                CASE
                    WHEN (pli.taxable IS DISTINCT FROM false) THEN round((((pli.total_cost)::numeric * po.tax_rate_percent) / 100.0))
                    ELSE (0)::numeric
                END), (0)::numeric)) + COALESCE(sum(
                CASE
                    WHEN ((po.shipping_cost > 0) AND (po.subtotal > 0)) THEN round((((pli.total_cost)::numeric / (po.subtotal)::numeric) * (po.shipping_cost)::numeric))
                    ELSE (0)::numeric
                END), (0)::numeric)) AS po_cents
           FROM (po_line_items pli
             JOIN purchase_orders po ON (((po.id = pli.po_id) AND (po.deleted_at IS NULL) AND (po.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'cancelled'::text, 'canceled'::text])))))
          WHERE (pli.project_id = p.id)) po_costs ON (true))
     LEFT JOIN LATERAL ( SELECT ((COALESCE(sum(rli.total_cost), (0)::bigint))::numeric + COALESCE(sum(round((((rli.total_cost)::numeric * r.tax_rate_percent) / 100.0))), (0)::numeric)) AS req_cents
           FROM (requisition_line_items rli
             JOIN requisitions r ON (((r.id = rli.requisition_id) AND (r.deleted_at IS NULL))))
          WHERE ((rli.project_id = p.id) AND (r.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'closed'::text])) AND (NOT ((r.status = 'ordered'::text) AND (r.converted_po_id IS NOT NULL))))) req_costs ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(round((di.quantity * (di.unit_cost)::numeric))), (0)::numeric) AS direct_cents
           FROM project_direct_items di
          WHERE ((di.project_id = p.id) AND (di.deleted_at IS NULL))) direct_costs ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(sc.amount), (0)::bigint) AS subcontract_cents
           FROM project_subcontract_costs sc
          WHERE ((sc.project_id = p.id) AND (sc.deleted_at IS NULL))) sub_costs ON (true))
     CROSS JOIN LATERAL ( SELECT (((po_costs.po_cents + req_costs.req_cents) + direct_costs.direct_cents) + (sub_costs.subcontract_cents)::numeric) AS cost_to_date_cents) cost)
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(c.amount_cents), (0)::bigint) AS approved_change_cents,
            count(*) AS change_order_count
           FROM project_change_orders c
          WHERE ((c.project_id = p.id) AND (c.status = 'approved'::text) AND (c.deleted_at IS NULL))) co ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum((i.total_cents - COALESCE(i.tax_cents, 0))), (0)::bigint) AS billed_cents
           FROM crm_invoices i
          WHERE ((i.project_id = p.id) AND (i.deleted_at IS NULL) AND (i.status <> ALL (ARRAY['draft'::text, 'void'::text])))) bill ON (true))
  WHERE (p.deleted_at IS NULL);

create or replace view public.rpt_tickets
with (security_invoker = on) as
SELECT t.id,
    t.ticket_number,
    t.type,
    t.status,
    t.priority,
    t.subject,
    t.category,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    t.assigned_to,
    t.due_date,
    t.closed_at,
    t.created_at
   FROM (crm_tickets t
     LEFT JOIN clients c ON ((c.id = t.client_id)))
  WHERE (t.deleted_at IS NULL);

create or replace view public.rpt_timesheets
with (security_invoker = on) as
SELECT t.id,
    ((t.clocked_in_at AT TIME ZONE org_timezone(t.org_id)))::date AS work_date,
    m.name AS member_name,
    cw.name AS crew_name,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    v.status AS visit_status,
    t.clocked_in_at,
    t.clocked_out_at,
    t.break_minutes,
    t.lunch_minutes,
    calc.hours,
    m.labor_burden_cents_per_hour,
        CASE
            WHEN ((calc.paid_hours IS NOT NULL) AND (m.labor_burden_cents_per_hour IS NOT NULL)) THEN (round((calc.paid_hours * (m.labor_burden_cents_per_hour)::numeric)))::integer
            ELSE NULL::integer
        END AS labor_cost_cents
   FROM ((((((crm_crew_member_times t
     JOIN crm_crew_members m ON ((m.id = t.crew_member_id)))
     LEFT JOIN crm_crews cw ON ((cw.id = m.crew_id)))
     LEFT JOIN crm_job_visits v ON (((v.id = t.visit_id) AND (v.deleted_at IS NULL))))
     LEFT JOIN organizations o ON ((o.id = t.org_id)))
     LEFT JOIN clients c ON ((c.id = v.client_id)))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round(((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)) - ((GREATEST(COALESCE(v.break_minutes, 0), 0))::numeric / 60.0)), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS hours,
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round(((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)) -
                    CASE
                        WHEN
                        CASE
                            WHEN (v.break_paid IS NOT NULL) THEN (NOT v.break_paid)
                            ELSE (COALESCE((o.customizations ->> 'crewBreaksUnpaid'::text), 'true'::text) <> 'false'::text)
                        END THEN ((GREATEST(COALESCE(v.break_minutes, 0), 0))::numeric / 60.0)
                        ELSE (0)::numeric
                    END), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS paid_hours) calc)
  WHERE (t.deleted_at IS NULL);

create or replace view public.rpt_upsells
with (security_invoker = on) as
WITH linked_estimate AS (
         SELECT DISTINCT ON (l.ticket_id) l.ticket_id,
            e.id AS estimate_id,
            e.estimate_number,
            e.stage AS estimate_stage,
            e.total_cents AS estimate_total_cents
           FROM (crm_ticket_links l
             JOIN estimates e ON (((e.id = l.linked_id) AND (e.deleted_at IS NULL))))
          WHERE (l.link_type = 'estimate'::text)
          ORDER BY l.ticket_id, l.created_at DESC
        )
 SELECT t.id,
    t.ticket_number,
    t.created_at AS submitted_at,
    (CASE WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)' ELSE c.display_name END) AS client_name,
    COALESCE(s.name, replace(t.subject, 'Upsell: '::text, ''::text)) AS service_suggested,
    COALESCE(p.name, p.email) AS submitted_by,
    cw.name AS crew_name,
    t.status AS ticket_status,
    t.body AS crew_note,
    le.estimate_number,
    le.estimate_stage,
    le.estimate_total_cents,
        CASE
            WHEN (le.estimate_id IS NULL) THEN 'Not quoted'::text
            WHEN (le.estimate_stage = ANY (ARRAY['won'::text, 'invoiced'::text, 'accepted'::text])) THEN 'Won'::text
            WHEN (le.estimate_stage = 'lost'::text) THEN 'Lost'::text
            ELSE 'Quoted'::text
        END AS outcome,
        CASE
            WHEN (le.estimate_stage = ANY (ARRAY['won'::text, 'invoiced'::text, 'accepted'::text])) THEN COALESCE(le.estimate_total_cents, 0)
            ELSE 0
        END AS won_revenue_cents
   FROM (((((crm_tickets t
     LEFT JOIN clients c ON ((c.id = t.client_id)))
     LEFT JOIN crm_services s ON ((s.id = t.upsell_service_id)))
     LEFT JOIN profiles p ON ((p.id = t.created_by)))
     LEFT JOIN crm_crews cw ON (((cw.user_id = t.created_by) AND (cw.deleted_at IS NULL))))
     LEFT JOIN linked_estimate le ON ((le.ticket_id = t.id)))
  WHERE ((t.category = 'Upsell'::text) AND (t.deleted_at IS NULL));

