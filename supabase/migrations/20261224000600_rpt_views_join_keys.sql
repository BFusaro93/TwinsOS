-- Report Center joins + client custom fields: expose the foreign keys the report
-- engine joins on.
--
-- Each view below gets one extra column (client_id) appended at the END of its select
-- list. (The two line-item views are deliberately NOT touched: line items join to
-- their invoice / estimate on the document number, which is unique per org.) Appending is the only change a
-- CREATE OR REPLACE VIEW may make to a view's column list, so nothing that already
-- reads these views — the dataset catalog, saved analyses, dashboards, scheduled
-- reports — sees any difference. Bodies are the live definitions (read with
-- pg_get_viewdef on PROD 2026-11-06) plus the appended columns; security_invoker
-- stays on, so every caller still sees only their own org's rows.

create or replace view public.rpt_invoices with (security_invoker = on) as
 SELECT i.id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.status,
        CASE
            WHEN c.id IS NULL THEN '(deleted)'::text
            WHEN c.deleted_at IS NOT NULL THEN COALESCE(c.display_name || ' (deleted)'::text, '(deleted)'::text)
            ELSE c.display_name
        END AS client_name,
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
    i.contract_id IS NOT NULL AS under_contract,
    c.billing_city,
    c.billing_zip,
        CASE
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'void'::text])) AND i.balance_cents > 0 THEN GREATEST(0, (now() AT TIME ZONE org_timezone(i.org_id))::date - COALESCE(i.due_date, i.invoice_date))
            ELSE 0
        END AS days_overdue,
    i.created_at,
    i.status <> ALL (ARRAY['draft'::text, 'void'::text]) AS is_issued,
    i.total_cents - i.tax_cents AS revenue_ex_tax_cents,
    i.client_id AS client_id
   FROM crm_invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     LEFT JOIN crm_employees sr ON sr.id = i.sales_rep_id
  WHERE i.deleted_at IS NULL;

create or replace view public.rpt_payments with (security_invoker = on) as
 SELECT p.id,
    p.payment_date,
        CASE
            WHEN c.id IS NULL THEN '(deleted)'::text
            WHEN c.deleted_at IS NOT NULL THEN COALESCE(c.display_name || ' (deleted)'::text, '(deleted)'::text)
            ELSE c.display_name
        END AS client_name,
    p.method,
    p.reference,
    p.memo,
    p.amount_cents,
    p.unused_amount_cents,
    p.refunded_amount_cents,
    GREATEST(0, COALESCE(p.amount_cents, 0) - COALESCE(p.unused_amount_cents, 0) - COALESCE(p.refunded_amount_cents, 0)) AS applied_amount_cents,
    p.is_prepayment,
    i.invoice_number,
    c.billing_zip,
    p.created_at,
    COALESCE(p.is_credit, false) AS is_credit,
    COALESCE(p.is_credit, false) = false AND COALESCE(p.method, ''::text) <> 'AR Write-off'::text AS is_cash,
    COALESCE(p.processing_fee_cents, 0) AS processing_fee_cents,
    COALESCE(p.amount_cents, 0) - COALESCE(p.refunded_amount_cents, 0) AS net_amount_cents,
    p.client_id AS client_id
   FROM crm_payments p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN crm_invoices i ON i.id = p.invoice_id
  WHERE p.deleted_at IS NULL;

create or replace view public.rpt_estimates with (security_invoker = on) as
 SELECT e.id,
    e.estimate_number,
    e.estimate_date,
    e.valid_until_date,
    e.stage,
        CASE
            WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)'::text
            ELSE c.display_name
        END AS client_name,
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
    (now() AT TIME ZONE org_timezone(e.org_id))::date - e.estimate_date AS age_days,
    e.created_at,
    e.updated_at,
    e.client_id AS client_id
   FROM estimates e
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN crm_employees sr ON sr.id = e.sales_rep_id
  WHERE e.deleted_at IS NULL;

create or replace view public.rpt_contracts with (security_invoker = on) as
 SELECT k.id,
    k.title,
        CASE
            WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)'::text
            ELSE c.display_name
        END AS client_name,
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
    k.created_at,
    k.client_id AS client_id
   FROM crm_contracts k
     LEFT JOIN clients c ON c.id = k.client_id
     LEFT JOIN crm_employees sr ON sr.id = k.sales_rep_id
  WHERE k.deleted_at IS NULL;

create or replace view public.rpt_jobs with (security_invoker = on) as
 SELECT j.id,
    j.job_number,
        CASE
            WHEN c.deleted_at IS NOT NULL THEN c.display_name || ' (deleted)'::text
            ELSE c.display_name
        END AS client_name,
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
          WHERE js.job_id = j.id) AS service_names,
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
    j.contract_id IS NOT NULL AS under_contract,
    j.is_complete,
    j.created_at,
    c.primary_phone AS client_phone,
    j.call_ahead,
    j.client_id AS client_id
   FROM crm_jobs j
     LEFT JOIN clients c ON c.id = j.client_id
     LEFT JOIN crm_crews cw ON cw.id = j.crew_id
     LEFT JOIN crm_employees sr ON sr.id = j.sales_rep_id
  WHERE j.deleted_at IS NULL;
