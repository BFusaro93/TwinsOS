-- 20260903010000_sales_rep_assigned_to_fk_target_employees.sql repointed
-- sales_rep_id from profiles(id) to crm_employees(id), but these rpt_*
-- report views still joined `profiles sr ON sr.id = <table>.sales_rep_id`
-- directly (not through the FK, so the constraint change alone didn't touch
-- them) -- after that migration sales_rep_id holds crm_employees ids, so
-- every one of these joins now silently matches nothing and every "Sales
-- Rep" report column would go blank. Recreate each view against
-- crm_employees instead, using first_name/last_name (crm_employees has no
-- single `name` column).

create or replace view rpt_client_contacts as
 SELECT ct.id,
    c.display_name AS client_name,
    c.status AS client_status,
    ct.first_name,
    ct.last_name,
    ct.contact_type,
    ct.phone,
    ct.phone_type,
    ct.email,
    ct.is_primary,
    ct.ok_to_email,
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
    c.balance_outstanding_cents,
    ct.created_at
   FROM client_contacts ct
     JOIN clients c ON c.id = ct.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_employees sr ON sr.id = c.sales_rep_id
  WHERE ct.deleted_at IS NULL;

create or replace view rpt_clients as
 SELECT c.id,
    c.display_name,
    c.first_name,
    c.account_type,
    c.status,
    c.source,
    c.referred_by,
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
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
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
  WHERE c.deleted_at IS NULL;

create or replace view rpt_contracts as
 SELECT k.id,
    k.title,
    c.display_name AS client_name,
    k.status,
    k.start_date,
    k.end_date,
    k.monthly_amount_cents,
    k.billing_frequency,
    k.billing_day_of_month,
    k.is_active,
    k.auto_generate,
    k.last_billed_date,
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
    k.source,
    k.created_at
   FROM crm_contracts k
     JOIN clients c ON c.id = k.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_employees sr ON sr.id = k.sales_rep_id
  WHERE k.deleted_at IS NULL;

create or replace view rpt_estimate_line_items as
 SELECT li.id,
    e.estimate_number,
    e.estimate_date,
    e.stage AS estimate_stage,
    c.display_name AS client_name,
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
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
    round(COALESCE(li.margin_bps, 0)::numeric / 100.0, 1) AS margin_pct
   FROM estimate_line_items li
     JOIN estimates e ON e.id = li.estimate_id AND e.deleted_at IS NULL
     JOIN clients c ON c.id = e.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_employees sr ON sr.id = e.sales_rep_id
  WHERE li.deleted_at IS NULL AND (COALESCE(li.row_type, 'line'::text) <> ALL (ARRAY['section'::text, 'text'::text]));

create or replace view rpt_estimates as
 SELECT e.id,
    e.estimate_number,
    e.estimate_date,
    e.valid_until_date,
    e.stage,
    c.display_name AS client_name,
    c.status AS client_status,
    COALESCE(e.source, c.source) AS source,
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
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
    CURRENT_DATE - e.estimate_date AS age_days,
    e.created_at,
    e.updated_at
   FROM estimates e
     JOIN clients c ON c.id = e.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_employees sr ON sr.id = e.sales_rep_id
  WHERE e.deleted_at IS NULL;

create or replace view rpt_invoices as
 SELECT i.id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.status,
    c.display_name AS client_name,
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
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
    i.contract_id IS NOT NULL AS under_contract,
    c.billing_city,
    c.billing_zip,
        CASE
            WHEN i.balance_cents > 0 AND i.due_date IS NOT NULL THEN GREATEST(0, CURRENT_DATE - i.due_date)
            ELSE 0
        END AS days_overdue,
    i.created_at
   FROM crm_invoices i
     JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_employees sr ON sr.id = i.sales_rep_id
  WHERE i.deleted_at IS NULL;

create or replace view rpt_job_visits as
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
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    COALESCE(v.rate_cents, j.rate_cents) AS rate_cents,
    calc.revenue_cents,
    v.actual_labor_cost_cents,
        CASE
            WHEN calc.actual_hours > 0::numeric THEN round(calc.revenue_cents::numeric / calc.actual_hours)::integer
            ELSE NULL::integer
        END AS rev_per_man_hr_cents,
    round(COALESCE(v.budgeted_hours, s.budgeted_hours * s.team_size::numeric, j.budgeted_hours, 0::numeric) - COALESCE(calc.actual_hours, 0::numeric), 2) AS variance_hours,
    j.service_city,
    j.service_zip,
    v.skip_reason,
    v.clocked_in_at,
    v.clocked_out_at,
    ( SELECT string_agg(DISTINCT js.budget_method, ', '::text) AS string_agg
           FROM crm_job_services js
          WHERE js.job_id = j.id) AS budget_methods
   FROM crm_job_visits v
     JOIN crm_jobs j ON j.id = v.job_id AND j.deleted_at IS NULL
     JOIN clients c ON c.id = COALESCE(v.client_id, j.client_id) AND c.deleted_at IS NULL
     LEFT JOIN crm_crews cw ON cw.id = COALESCE(v.crew_id, j.crew_id)
     LEFT JOIN crm_employees sr ON sr.id = j.sales_rep_id
     LEFT JOIN crm_job_services s ON s.id = v.job_service_id
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
            (COALESCE(v.rate_cents, j.rate_cents, 0)::numeric * COALESCE(NULLIF(v.qty, 0::numeric), 1::numeric))::integer AS revenue_cents) calc
  WHERE v.deleted_at IS NULL;

create or replace view rpt_jobs as
 SELECT j.id,
    j.job_number,
    c.display_name AS client_name,
    j.job_type,
    j.status,
    j.sub_status,
    j.scheduled_date,
    j.date_sold,
    j.source,
    nullif(trim(concat(sr.first_name, ' ', sr.last_name)), '') AS sales_rep,
    cw.name AS crew_name,
    ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE js.job_id = j.id) AS service_names,
    j.man_count,
    j.rate_cents,
    j.budgeted_hours,
    j.actual_hours,
    j.service_total_cents,
    j.product_total_cents,
    j.tax_cents,
    j.total_cents,
    j.service_address,
    j.service_city,
    j.service_zip,
    j.package_name,
    j.contract_id IS NOT NULL AS under_contract,
    j.is_complete,
    j.created_at,
    c.primary_phone AS client_phone,
    j.call_ahead
   FROM crm_jobs j
     JOIN clients c ON c.id = j.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_crews cw ON cw.id = j.crew_id
     LEFT JOIN crm_employees sr ON sr.id = j.sales_rep_id
  WHERE j.deleted_at IS NULL;
