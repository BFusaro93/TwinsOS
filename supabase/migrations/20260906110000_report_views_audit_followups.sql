-- Follow-ups from the 2026-09-03 Landscapt reports audit: view-level logic fixes.
-- Every view below is the live PROD definition (pg_get_viewdef, 2026-09-06) with
-- only the described expressions changed; column lists/order are unchanged so
-- CREATE OR REPLACE VIEW is valid. All keep security_invoker = on.
-- rpt_job_visits: variance_hours is NULL until a visit has actual hours (was budget - 0
-- for every scheduled/cancelled visit, inflating AvB under-budget totals).
create or replace view rpt_job_visits with (security_invoker = on) as
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    v.status,
    v.sub_status,
    c.display_name AS client_name,
    COALESCE(s.service_name, ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE js.job_id = j.id)) AS service_names,
    cw.name AS crew_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    COALESCE(v.rate_cents, s.rate_cents, svc_sum.rate_sum_cents, j.rate_cents) AS rate_cents,
    calc.revenue_cents,
    v.actual_labor_cost_cents,
        CASE
            WHEN calc.actual_hours > 0::numeric THEN round(calc.revenue_cents::numeric / calc.actual_hours)::integer
            ELSE NULL::integer
        END AS rev_per_man_hr_cents,
        CASE
            WHEN COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours) IS NOT NULL AND calc.actual_hours IS NOT NULL
              THEN round(COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours) - calc.actual_hours, 2)
            ELSE NULL::numeric
        END AS variance_hours,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    v.skip_reason,
    v.clocked_in_at,
    v.clocked_out_at,
    ( SELECT string_agg(DISTINCT js.budget_method, ', '::text) AS string_agg
           FROM crm_job_services js
          WHERE js.job_id = j.id) AS budget_methods,
    COALESCE(cs.code, ( SELECT string_agg(csv.code, ', '::text ORDER BY js2.sort_order) AS string_agg
           FROM crm_job_services js2
             JOIN crm_services csv ON csv.id = js2.service_id
          WHERE js2.job_id = j.id AND csv.code IS NOT NULL)) AS service_code,
    round(calc.revenue_cents::numeric / NULLIF(COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours), 0::numeric))::integer AS budgeted_rev_per_man_hr_cents,
    v.org_id,
    COALESCE(to_char((v.clocked_in_at AT TIME ZONE 'America/New_York'::text), 'HH12:MI AM'::text), to_char(v.start_time::interval, 'HH12:MI AM'::text)) AS actual_start_time,
    COALESCE(to_char((v.clocked_out_at AT TIME ZONE 'America/New_York'::text), 'HH12:MI AM'::text), to_char(v.end_time::interval, 'HH12:MI AM'::text)) AS actual_stop_time
   FROM crm_job_visits v
     JOIN crm_jobs j ON j.id = v.job_id AND j.deleted_at IS NULL
     JOIN clients c ON c.id = COALESCE(v.client_id, j.client_id) AND c.deleted_at IS NULL
     LEFT JOIN crm_crews cw ON cw.id = COALESCE(v.crew_id, j.crew_id)
     LEFT JOIN crm_employees sr ON sr.id = j.sales_rep_id
     LEFT JOIN crm_job_services s ON s.id = v.job_service_id
     LEFT JOIN crm_services cs ON cs.id = s.service_id
     -- Σ of every service line on the job (rate × qty) — the revenue of a visit
     -- that is NOT linked to a single service line (legacy / single-visit jobs).
     CROSS JOIN LATERAL ( SELECT sum(js.rate_cents)::integer AS rate_sum_cents,
                                 sum(js.rate_cents::numeric * COALESCE(NULLIF(js.qty, 0::numeric), 1::numeric))::integer AS revenue_sum_cents
                            FROM crm_job_services js
                           WHERE js.job_id = j.id) svc_sum
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN v.clocked_in_at IS NOT NULL AND v.clocked_out_at IS NOT NULL AND v.clocked_out_at > v.clocked_in_at THEN round(EXTRACT(epoch FROM v.clocked_out_at - v.clocked_in_at) / 3600.0, 2) *
                    CASE
                        WHEN COALESCE(v.men_count, 0) = 0 THEN 1
                        ELSE v.men_count
                    END::numeric
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN v.start_time IS NOT NULL AND v.end_time IS NOT NULL AND v.end_time > v.start_time THEN round(EXTRACT(epoch FROM v.end_time - v.start_time) / 3600.0, 2) *
                    CASE
                        WHEN COALESCE(v.men_count, 0) = 0 THEN 1
                        ELSE v.men_count
                    END::numeric
                    ELSE NULL::numeric
                END) AS actual_hours,
            COALESCE(
                (v.rate_cents::numeric * COALESCE(NULLIF(v.qty, 0::numeric), 1::numeric))::integer,
                (s.rate_cents::numeric * COALESCE(NULLIF(s.qty, 0::numeric), 1::numeric))::integer,
                svc_sum.revenue_sum_cents,
                j.rate_cents,
                0) AS revenue_cents) calc
  WHERE v.deleted_at IS NULL;


-- rpt_job_services: budgeted_hours is now man-hours (per-person x team_size) to match
-- rpt_job_visits and actual_man_hours; men_count 0 maps to 1 like rpt_job_visits.
create or replace view rpt_job_services with (security_invoker = on) as
 WITH service_weights AS (
         SELECT jsv_1.job_id,
            jsv_1.id AS job_service_id,
            COALESCE(jsv_1.budgeted_hours, 0::numeric) * COALESCE(jsv_1.team_size, 1)::numeric AS weight,
            sum(COALESCE(jsv_1.budgeted_hours, 0::numeric) * COALESCE(jsv_1.team_size, 1)::numeric) OVER (PARTITION BY jsv_1.job_id) AS total_weight,
            count(*) OVER (PARTITION BY jsv_1.job_id) AS service_count
           FROM crm_job_services jsv_1
        )
 SELECT (v.id::text || '-'::text) || jsv.id::text AS id,
    v.id AS visit_id,
    jsv.id AS job_service_id,
    v.job_id,
    j.status AS job_status,
    j.is_complete,
    v.status AS visit_status,
    v.scheduled_date,
    c.display_name AS client_name,
    jsv.service_id,
    jsv.service_name,
    cs.category AS service_category,
    cs.unit AS service_unit,
    jsv.budget_method,
    cs.production_rate_sqft_per_hr AS assumed_production_rate,
    jsv.qty,
    jsv.budgeted_hours * COALESCE(jsv.team_size, 1)::numeric AS budgeted_hours,
    round(calc.actual_hours * shr.share, 2) AS job_actual_hours,
        CASE WHEN COALESCE(v.men_count, j.man_count, 0) = 0 THEN 1 ELSE COALESCE(v.men_count, j.man_count) END AS man_count,
    round(COALESCE(calc.actual_hours * shr.share, 0::numeric), 2) AS actual_man_hours,
        CASE
            WHEN (calc.actual_hours * shr.share) > 0::numeric THEN round(jsv.qty / (calc.actual_hours * shr.share), 2)
            ELSE NULL::numeric
        END AS actual_production_rate,
        CASE
            WHEN cs.production_rate_sqft_per_hr > 0::numeric AND (calc.actual_hours * shr.share) > 0::numeric THEN round((jsv.qty / (calc.actual_hours * shr.share) - cs.production_rate_sqft_per_hr) / cs.production_rate_sqft_per_hr * 10000::numeric)::integer
            ELSE NULL::integer
        END AS rate_variance_bps
   FROM crm_job_visits v
     JOIN crm_jobs j ON j.id = v.job_id AND j.deleted_at IS NULL
     JOIN clients c ON c.id = COALESCE(v.client_id, j.client_id) AND c.deleted_at IS NULL
     JOIN crm_job_services jsv ON v.job_service_id IS NOT NULL AND jsv.id = v.job_service_id OR v.job_service_id IS NULL AND jsv.job_id = v.job_id
     JOIN service_weights sw ON sw.job_service_id = jsv.id
     LEFT JOIN crm_services cs ON cs.id = jsv.service_id
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN v.clocked_in_at IS NOT NULL AND v.clocked_out_at IS NOT NULL AND v.clocked_out_at > v.clocked_in_at THEN round(EXTRACT(epoch FROM v.clocked_out_at - v.clocked_in_at) / 3600.0, 2) * (CASE WHEN COALESCE(v.men_count, j.man_count, 0) = 0 THEN 1 ELSE COALESCE(v.men_count, j.man_count) END)::numeric
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN v.start_time IS NOT NULL AND v.end_time IS NOT NULL AND v.end_time > v.start_time THEN round(EXTRACT(epoch FROM v.end_time - v.start_time) / 3600.0, 2) * (CASE WHEN COALESCE(v.men_count, j.man_count, 0) = 0 THEN 1 ELSE COALESCE(v.men_count, j.man_count) END)::numeric
                    ELSE NULL::numeric
                END) AS actual_hours) calc
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN v.job_service_id IS NOT NULL THEN 1.0
                    WHEN sw.total_weight > 0::numeric THEN sw.weight / sw.total_weight
                    ELSE 1.0 / sw.service_count::numeric
                END AS share) shr
  WHERE v.deleted_at IS NULL;

-- rpt_clients: referred_by falls back to the linked referrer's name.
create or replace view rpt_clients with (security_invoker = on) as
 SELECT c.id,
    c.display_name,
    c.first_name,
    c.account_type,
    c.status,
    c.source,
    COALESCE(c.referred_by, ref.display_name) AS referred_by,
    c.client_since,
    c.cancellation_reason,
    c.closed_at,
    c.primary_email,
    c.primary_phone,
    c.billing_address,
    c.billing_city,
    c.billing_state,
    c.billing_zip,
    c.invoice_frequency,
    COALESCE(c.default_payment_method, c.payment_method) AS payment_method,
    c.billing_terms,
    c.is_taxable,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    c.balance_outstanding_cents,
    c.balance_credits_cents,
    c.balance_prepay_cents,
    c.balance_uninvoiced_cents,
    c.turf_sqft,
    c.gross_sqft,
    c.map_code,
    c.created_at
   FROM clients c
     LEFT JOIN crm_employees sr ON sr.id = c.sales_rep_id
     LEFT JOIN clients ref ON ref.id = c.referred_by_client_id
  WHERE c.deleted_at IS NULL;

-- rpt_estimates: age_days uses the New York calendar date.
create or replace view rpt_estimates with (security_invoker = on) as
 SELECT e.id,
    e.estimate_number,
    e.estimate_date,
    e.valid_until_date,
    e.stage,
    c.display_name AS client_name,
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
    round(COALESCE(e.probability_bps, 0)::numeric / 100.0, 1) AS probability_pct,
    e.reason,
    (now() AT TIME ZONE 'America/New_York')::date - e.estimate_date AS age_days,
    e.created_at,
    e.updated_at
   FROM estimates e
     JOIN clients c ON c.id = e.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_employees sr ON sr.id = e.sales_rep_id
  WHERE e.deleted_at IS NULL;

-- rpt_projects_wip: cost-to-date excludes draft/rejected POs and requisitions; billed-to-date
-- counts only issued invoices, pre-tax, to match the pre-tax contract price.
create or replace view rpt_projects_wip with (security_invoker = on) as
 SELECT p.id,
    p.name,
    p.status,
    COALESCE(cl.display_name, p.customer_name) AS client_name,
    p.contract_price AS contract_cents,
    p.estimated_cost_cents AS eac_cents,
    p.contract_price - p.estimated_cost_cents AS estimated_gp_cents,
        CASE
            WHEN p.contract_price > 0 THEN round((p.contract_price - p.estimated_cost_cents)::numeric / p.contract_price::numeric * 100::numeric, 1)
            ELSE NULL::numeric
        END AS estimated_gp_pct,
    cost.cost_to_date_cents,
        CASE
            WHEN p.estimated_cost_cents > 0 THEN round(LEAST(cost.cost_to_date_cents, p.estimated_cost_cents::numeric) / p.estimated_cost_cents::numeric * 100::numeric, 1)
            ELSE 0::numeric
        END AS pct_complete,
    round(p.contract_price::numeric *
        CASE
            WHEN p.estimated_cost_cents > 0 THEN LEAST(cost.cost_to_date_cents, p.estimated_cost_cents::numeric) / p.estimated_cost_cents::numeric
            ELSE 0::numeric
        END)::integer AS earned_revenue_cents,
    COALESCE(bill.billed_cents, 0::bigint) AS billed_cents,
    COALESCE(bill.billed_cents, 0::bigint) - round(p.contract_price::numeric *
        CASE
            WHEN p.estimated_cost_cents > 0 THEN LEAST(cost.cost_to_date_cents, p.estimated_cost_cents::numeric) / p.estimated_cost_cents::numeric
            ELSE 0::numeric
        END)::integer AS over_under_billed_cents,
    p.contract_price - COALESCE(bill.billed_cents, 0::bigint) AS remaining_to_bill_cents,
    p.start_date,
    p.end_date,
    p.created_at
   FROM projects p
     LEFT JOIN clients cl ON cl.id = p.client_id AND cl.deleted_at IS NULL
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(pli.total_cost), 0::bigint)::numeric + COALESCE(sum(
                CASE
                    WHEN pli.taxable IS DISTINCT FROM false THEN round(pli.total_cost::numeric * po.tax_rate_percent / 100.0)
                    ELSE 0::numeric
                END), 0::numeric) + COALESCE(sum(
                CASE
                    WHEN po.shipping_cost > 0 AND po.subtotal > 0 THEN round(pli.total_cost::numeric / po.subtotal::numeric * po.shipping_cost::numeric)
                    ELSE 0::numeric
                END), 0::numeric) AS po_cents
           FROM po_line_items pli
             JOIN purchase_orders po ON po.id = pli.po_id AND po.deleted_at IS NULL AND po.status NOT IN ('draft', 'rejected', 'cancelled')
          WHERE pli.project_id = p.id) po_costs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(rli.total_cost), 0::bigint)::numeric + COALESCE(sum(round(rli.total_cost::numeric * r.tax_rate_percent / 100.0)), 0::numeric) AS req_cents
           FROM requisition_line_items rli
             JOIN requisitions r ON r.id = rli.requisition_id AND r.deleted_at IS NULL
          WHERE rli.project_id = p.id AND r.status NOT IN ('draft', 'rejected') AND NOT (r.status = 'ordered'::text AND r.converted_po_id IS NOT NULL)) req_costs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(round(di.quantity * di.unit_cost::numeric)), 0::numeric) AS direct_cents
           FROM project_direct_items di
          WHERE di.project_id = p.id AND di.deleted_at IS NULL) direct_costs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(sc.amount), 0::bigint) AS subcontract_cents
           FROM project_subcontract_costs sc
          WHERE sc.project_id = p.id AND sc.deleted_at IS NULL) sub_costs ON true
     CROSS JOIN LATERAL ( SELECT po_costs.po_cents + req_costs.req_cents + direct_costs.direct_cents + sub_costs.subcontract_cents::numeric AS cost_to_date_cents) cost
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(i.total_cents - COALESCE(i.tax_cents, 0)), 0::bigint) AS billed_cents
           FROM crm_invoices i
             JOIN crm_jobs j ON j.id = i.crm_job_id AND j.deleted_at IS NULL
          WHERE j.project_id = p.id AND i.deleted_at IS NULL AND i.status NOT IN ('draft', 'void')) bill ON true
  WHERE p.deleted_at IS NULL;

-- rpt_chemical_applications: service_date prefers the visit actually worked, then the
-- recorded application start, then the job's scheduled date.
create or replace view rpt_chemical_applications with (security_invoker = on) as
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
     LEFT JOIN crm_chemical_lookup_items meth ON meth.id = ca.application_method_id
     LEFT JOIN crm_employees e ON e.id = ca.applicator_employee_id
  WHERE ca.deleted_at IS NULL;

-- rpt_timesheets: work_date is the New York calendar date; soft-deleted visits are not joined.
create or replace view rpt_timesheets with (security_invoker = on) as
 SELECT t.id,
    (t.clocked_in_at AT TIME ZONE 'America/New_York'::text)::date AS work_date,
    m.name AS member_name,
    cw.name AS crew_name,
    c.display_name AS client_name,
    v.status AS visit_status,
    t.clocked_in_at,
    t.clocked_out_at,
    t.break_minutes,
    t.lunch_minutes,
    calc.hours,
    m.labor_burden_cents_per_hour,
        CASE
            WHEN calc.hours IS NOT NULL AND m.labor_burden_cents_per_hour IS NOT NULL THEN round(calc.hours * m.labor_burden_cents_per_hour::numeric)::integer
            ELSE NULL::integer
        END AS labor_cost_cents
   FROM crm_crew_member_times t
     JOIN crm_crew_members m ON m.id = t.crew_member_id
     LEFT JOIN crm_crews cw ON cw.id = m.crew_id
     LEFT JOIN crm_job_visits v ON v.id = t.visit_id AND v.deleted_at IS NULL
     LEFT JOIN clients c ON c.id = v.client_id AND c.deleted_at IS NULL
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN t.clocked_out_at IS NOT NULL THEN GREATEST(round(EXTRACT(epoch FROM t.clocked_out_at - t.clocked_in_at) / 3600.0 - COALESCE(t.break_minutes, 0)::numeric / 60.0 - COALESCE(t.lunch_minutes, 0)::numeric / 60.0, 2), 0::numeric)
                    ELSE NULL::numeric
                END AS hours) calc;

-- rpt_contract_service_usage: visits of soft-deleted jobs no longer count as used.
create or replace view rpt_contract_service_usage with (security_invoker = on) as
 SELECT cs.id,
    cs.org_id,
    cs.contract_id,
    ct.title AS contract_title,
    ct.status AS contract_status,
    ct.start_date AS contract_start_date,
    ct.end_date AS contract_end_date,
    cl.display_name AS client_name,
    cs.service_name,
    cs.visits_included,
    COALESCE(usage.visits_used, 0::bigint) AS visits_used,
    cs.visits_included - COALESCE(usage.visits_used, 0::bigint) AS visits_remaining,
    COALESCE(usage.visits_used, 0::bigint) > cs.visits_included AS is_over
   FROM crm_contract_services cs
     JOIN crm_contracts ct ON ct.id = cs.contract_id AND ct.deleted_at IS NULL
     JOIN clients cl ON cl.id = ct.client_id AND cl.deleted_at IS NULL
     LEFT JOIN LATERAL ( SELECT count(*) AS visits_used
           FROM crm_job_visits v
             JOIN crm_job_services js ON js.id = v.job_service_id
             JOIN crm_jobs j ON j.id = v.job_id AND j.deleted_at IS NULL
          WHERE j.contract_id = cs.contract_id AND v.status = 'completed'::text AND v.deleted_at IS NULL AND (cs.service_id IS NOT NULL AND js.service_id = cs.service_id OR cs.service_id IS NULL AND js.service_id IS NULL AND js.service_name = cs.service_name)) usage ON true
  WHERE cs.deleted_at IS NULL;
