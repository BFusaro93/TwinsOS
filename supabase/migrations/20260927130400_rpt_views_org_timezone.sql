-- ============================================================
-- rpt_* views: use the org's own timezone instead of hardcoded New York.
--
-- Six security_invoker views derived calendar days / "today" with
-- `AT TIME ZONE 'America/New_York'`:
--   rpt_timesheets.work_date, rpt_job_visits.worked_date / actual_start_time /
--   actual_stop_time, rpt_invoices.days_overdue, rpt_estimates.age_days,
--   rpt_sales_rep_month (current month), rpt_chemical_applications.service_date.
-- Each now uses public.org_timezone(<row>.org_id), which reads
-- organizations.timezone (SECURITY DEFINER, so an organizations RLS policy
-- can't null it) and falls back to America/New_York.
--
-- Bodies are the LIVE PROD definitions (pg_get_viewdef, 2026-09-27) with only
-- the timezone literal replaced, so every column list, name, order and type is
-- identical — CREATE OR REPLACE VIEW is enough, no DROP needed. On a drifted
-- env whose view columns differ, CREATE OR REPLACE will fail loudly rather
-- than silently changing shape; re-derive from that env's live definition.
-- ============================================================

-- rpt_chemical_applications
create or replace view public.rpt_chemical_applications with (security_invoker = on) as
 SELECT ca.id,
    COALESCE(v.scheduled_date, ((ca.application_start_time AT TIME ZONE public.org_timezone(ca.org_id)))::date, j.scheduled_date) AS service_date,
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
          WHERE (li.id = ANY (ca.areas_treated_ids))) AS areas_treated
   FROM ((((((((crm_chemical_applications ca
     JOIN crm_jobs j ON (((j.id = ca.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN crm_job_visits v ON (((v.id = ca.visit_id) AND (v.deleted_at IS NULL))))
     JOIN clients c ON (((c.id = j.client_id) AND (c.deleted_at IS NULL))))
     LEFT JOIN product_items p ON ((p.id = ca.product_id)))
     LEFT JOIN crm_chemical_lookup_items uom ON ((uom.id = ca.unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items solution_uom ON ((solution_uom.id = ca.solution_unit_of_measure_id)))
     LEFT JOIN crm_chemical_lookup_items meth ON ((meth.id = ca.application_method_id)))
     LEFT JOIN crm_employees e ON ((e.id = ca.applicator_employee_id)))
  WHERE (ca.deleted_at IS NULL);

-- rpt_estimates
create or replace view public.rpt_estimates with (security_invoker = on) as
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
    round(((COALESCE(e.probability_bps, 0))::numeric / 100.0), 1) AS probability_pct,
    e.reason,
    (((now() AT TIME ZONE public.org_timezone(e.org_id)))::date - e.estimate_date) AS age_days,
    e.created_at,
    e.updated_at
   FROM ((estimates e
     JOIN clients c ON (((c.id = e.client_id) AND (c.deleted_at IS NULL))))
     LEFT JOIN crm_employees sr ON ((sr.id = e.sales_rep_id)))
  WHERE (e.deleted_at IS NULL);

-- rpt_invoices
create or replace view public.rpt_invoices with (security_invoker = on) as
 SELECT i.id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.status,
    c.display_name AS client_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    i.description,
    i.subtotal_cents,
    i.discount_cents,
    i.tax_cents,
    i.total_cents,
    i.amount_paid_cents,
    i.balance_cents,
    i.terms,
    i.preferred_payment_method AS payment_method,
    i.service_address,
    i.po_number,
    (i.contract_id IS NOT NULL) AS under_contract,
    c.billing_city,
    c.billing_zip,
        CASE
            WHEN ((i.status <> ALL (ARRAY['draft'::text, 'void'::text])) AND (i.balance_cents > 0) AND (i.due_date IS NOT NULL)) THEN GREATEST(0, (((now() AT TIME ZONE public.org_timezone(i.org_id)))::date - i.due_date))
            ELSE 0
        END AS days_overdue,
    i.created_at,
    (i.status <> ALL (ARRAY['draft'::text, 'void'::text])) AS is_issued
   FROM ((crm_invoices i
     JOIN clients c ON (((c.id = i.client_id) AND (c.deleted_at IS NULL))))
     LEFT JOIN crm_employees sr ON ((sr.id = i.sales_rep_id)))
  WHERE (i.deleted_at IS NULL);

-- rpt_job_visits
create or replace view public.rpt_job_visits with (security_invoker = on) as
 WITH member_rates AS (
         SELECT m.org_id,
            m.crew_id,
                CASE
                    WHEN (COALESCE(m.labor_burden_cents_per_hour, 0) > 0) THEN (m.labor_burden_cents_per_hour)::numeric
                    ELSE ((COALESCE(e.hourly_rate_cents, 0))::numeric * ((1)::numeric + ((COALESCE(os.labor_burden_bps, 0))::numeric / 10000.0)))
                END AS rate
           FROM ((crm_crew_members m
             LEFT JOIN crm_employees e ON (((e.id = m.employee_id) AND (e.deleted_at IS NULL))))
             LEFT JOIN crm_overhead_settings os ON ((os.org_id = m.org_id)))
        )
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    COALESCE(((v.completed_at AT TIME ZONE public.org_timezone(v.org_id)))::date, v.scheduled_date) AS worked_date,
    v.status,
    v.sub_status,
    c.display_name AS client_name,
    COALESCE(s.service_name, ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id))) AS service_names,
    cw.name AS crew_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    calc.rate_cents,
    calc.revenue_cents,
    labor.labor_cost_cents AS actual_labor_cost_cents,
    labor.labor_cost_source,
        CASE
            WHEN (calc.actual_hours > (0)::numeric) THEN (round(((calc.revenue_cents)::numeric / calc.actual_hours)))::bigint
            ELSE NULL::bigint
        END AS rev_per_man_hr_cents,
        CASE
            WHEN ((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) IS NOT NULL) AND (calc.actual_hours IS NOT NULL)) THEN round((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) - calc.actual_hours), 2)
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
    (round(((calc.revenue_cents)::numeric / NULLIF(COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours), (0)::numeric))))::bigint AS budgeted_rev_per_man_hr_cents,
    v.org_id,
    COALESCE(to_char((v.clocked_in_at AT TIME ZONE public.org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.start_time)::interval, 'HH12:MI AM'::text)) AS actual_start_time,
    COALESCE(to_char((v.clocked_out_at AT TIME ZONE public.org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.end_time)::interval, 'HH12:MI AM'::text)) AS actual_stop_time
   FROM (((((((((crm_job_visits v
     JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
     JOIN clients c ON (((c.id = COALESCE(v.client_id, j.client_id)) AND (c.deleted_at IS NULL))))
     LEFT JOIN crm_crews cw ON ((cw.id = COALESCE(v.crew_id, j.crew_id))))
     LEFT JOIN crm_employees sr ON ((sr.id = j.sales_rep_id)))
     LEFT JOIN crm_job_services s ON ((s.id = v.job_service_id)))
     LEFT JOIN crm_services cs ON ((cs.id = s.service_id)))
     CROSS JOIN LATERAL ( SELECT (sum(js.rate_cents))::integer AS rate_sum_cents,
            (sum(((js.rate_cents)::numeric * COALESCE(NULLIF(js.qty, (0)::numeric), (1)::numeric))))::integer AS revenue_sum_cents
           FROM crm_job_services js
          WHERE ((js.job_id = j.id) AND COALESCE(js.included, true))) svc_sum)
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
                CASE
                    WHEN ((v.clocked_in_at IS NOT NULL) AND (v.clocked_out_at IS NOT NULL) AND (v.clocked_out_at > v.clocked_in_at)) THEN (round(GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.clocked_out_at - v.clocked_in_at)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))), 2) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN ((v.start_time IS NOT NULL) AND (v.end_time IS NOT NULL) AND (v.end_time > v.start_time)) THEN (round(GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.end_time - v.start_time)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))), 2) * (
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
                          WHERE ((m.crew_id = COALESCE(v.crew_id, j.crew_id)) AND (m.rate > (0)::numeric))) AS crew_rate,
                    ( SELECT avg(m.rate) AS avg
                           FROM member_rates m
                          WHERE ((m.org_id = v.org_id) AND (m.rate > (0)::numeric))) AS org_rate) rates) labor)
  WHERE (v.deleted_at IS NULL);

-- rpt_sales_rep_month
create or replace view public.rpt_sales_rep_month with (security_invoker = on) as
 SELECT e.id AS employee_id,
    e.org_id,
    NULLIF(TRIM(BOTH FROM concat(e.first_name, ' ', e.last_name)), ''::text) AS sales_rep,
    (COALESCE(((e.sales_goals ->> lower(to_char((((now() AT TIME ZONE public.org_timezone(e.org_id)))::date)::timestamp with time zone, 'Mon'::text))))::numeric, (0)::numeric))::bigint AS goal_cents,
    COALESCE(sum(i.total_cents) FILTER (WHERE ((i.invoice_date >= (date_trunc('month'::text, (((now() AT TIME ZONE public.org_timezone(e.org_id)))::date)::timestamp without time zone))::date) AND (i.invoice_date < ((date_trunc('month'::text, (((now() AT TIME ZONE public.org_timezone(e.org_id)))::date)::timestamp without time zone) + '1 mon'::interval))::date) AND (i.status <> ALL (ARRAY['void'::text, 'draft'::text])))), (0)::bigint) AS actual_cents
   FROM (crm_employees e
     LEFT JOIN crm_invoices i ON (((i.sales_rep_id = e.id) AND (i.deleted_at IS NULL))))
  WHERE ((e.deleted_at IS NULL) AND (e.is_sales_rep = true))
  GROUP BY e.id, e.org_id, e.first_name, e.last_name, e.sales_goals;

-- rpt_timesheets
create or replace view public.rpt_timesheets with (security_invoker = on) as
 SELECT t.id,
    ((t.clocked_in_at AT TIME ZONE public.org_timezone(t.org_id)))::date AS work_date,
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
            WHEN ((calc.hours IS NOT NULL) AND (m.labor_burden_cents_per_hour IS NOT NULL)) THEN (round((calc.hours * (m.labor_burden_cents_per_hour)::numeric)))::integer
            ELSE NULL::integer
        END AS labor_cost_cents
   FROM (((((crm_crew_member_times t
     JOIN crm_crew_members m ON ((m.id = t.crew_member_id)))
     LEFT JOIN crm_crews cw ON ((cw.id = m.crew_id)))
     LEFT JOIN crm_job_visits v ON (((v.id = t.visit_id) AND (v.deleted_at IS NULL))))
     LEFT JOIN clients c ON (((c.id = v.client_id) AND (c.deleted_at IS NULL))))
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (t.clocked_out_at IS NOT NULL) THEN GREATEST(round((((EXTRACT(epoch FROM (t.clocked_out_at - t.clocked_in_at)) / 3600.0) - ((COALESCE(t.break_minutes, 0))::numeric / 60.0)) - ((COALESCE(t.lunch_minutes, 0))::numeric / 60.0)), 2), (0)::numeric)
                    ELSE NULL::numeric
                END AS hours) calc);
