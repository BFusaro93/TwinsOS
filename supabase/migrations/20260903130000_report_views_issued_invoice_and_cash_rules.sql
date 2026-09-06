-- Report-layer money rules, decided once and applied in the views:
--
--  A. ISSUED-INVOICE RULE — an invoice is revenue / a receivable only when
--     status NOT IN ('draft','void'). Drafts are "uninvoiced work" (the
--     Income Not Invoiced report still shows them); they are never AR.
--     -> rpt_invoices.is_issued, rpt_invoice_line_items.is_issued (new columns)
--     -> rpt_invoices.days_overdue is 0 for draft/void (was aging drafts)
--     -> rpt_sales_rep_month.actual_cents excludes draft+void and is bounded to
--        the America/New_York calendar month on BOTH ends (was open-ended, so
--        month-in-advance contract invoices dated next month inflated it, and
--        CURRENT_DATE rolled over in UTC).
--
--  B. CASH RULE — a crm_payments row is cash received only when
--     is_credit = false AND method <> 'AR Write-off'; cash is net of refunds.
--     -> rpt_payments.is_credit, is_cash, processing_fee_cents,
--        net_amount_cents (new columns)
--     -> rpt_payments.applied_amount_cents now = greatest(0, amount − unused −
--        refunded) (refunds un-apply money from invoices but never touched
--        unused_amount_cents, so a fully refunded payment showed as applied).
--
-- New columns are appended at the END of each view so CREATE OR REPLACE VIEW
-- is valid; every other expression is the live PROD definition verbatim
-- (pg_get_viewdef, 2026-09-03). All views keep security_invoker = on.
--
-- NOT changed here (product decision, affects the app UI not just reports):
-- sync_client_balance still includes draft invoices in
-- clients.balance_outstanding_cents.

create or replace view rpt_invoices with (security_invoker = on) as
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
    i.contract_id IS NOT NULL AS under_contract,
    c.billing_city,
    c.billing_zip,
        CASE
            WHEN i.status NOT IN ('draft', 'void') AND i.balance_cents > 0 AND i.due_date IS NOT NULL
              THEN GREATEST(0, (now() AT TIME ZONE 'America/New_York')::date - i.due_date)
            ELSE 0
        END AS days_overdue,
    i.created_at,
    (i.status NOT IN ('draft', 'void')) AS is_issued
   FROM crm_invoices i
     JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_employees sr ON sr.id = i.sales_rep_id
  WHERE i.deleted_at IS NULL;

create or replace view rpt_invoice_line_items with (security_invoker = on) as
 SELECT li.id,
    i.invoice_number,
    i.invoice_date,
    i.status AS invoice_status,
    c.display_name AS client_name,
    li.name,
    li.description,
    li.service_date,
    li.qty,
    li.rate_cents,
    li.total_cents,
    li.is_taxable,
    li.hours,
    li.men,
    (i.status NOT IN ('draft', 'void')) AS is_issued
   FROM crm_invoice_line_items li
     JOIN crm_invoices i ON i.id = li.invoice_id AND i.deleted_at IS NULL
     JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL;

create or replace view rpt_payments with (security_invoker = on) as
 SELECT p.id,
    p.payment_date,
    c.display_name AS client_name,
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
    (COALESCE(p.is_credit, false) = false AND COALESCE(p.method, '') <> 'AR Write-off') AS is_cash,
    COALESCE(p.processing_fee_cents, 0) AS processing_fee_cents,
    (COALESCE(p.amount_cents, 0) - COALESCE(p.refunded_amount_cents, 0)) AS net_amount_cents
   FROM crm_payments p
     JOIN clients c ON c.id = p.client_id AND c.deleted_at IS NULL
     LEFT JOIN crm_invoices i ON i.id = p.invoice_id
  WHERE p.deleted_at IS NULL;

create or replace view rpt_sales_rep_month with (security_invoker = on) as
 SELECT e.id AS employee_id,
    e.org_id,
    NULLIF(TRIM(BOTH FROM concat(e.first_name, ' ', e.last_name)), ''::text) AS sales_rep,
    COALESCE((e.sales_goals ->> lower(to_char((now() AT TIME ZONE 'America/New_York')::date, 'Mon'::text)))::numeric, 0::numeric)::bigint AS goal_cents,
    COALESCE(sum(i.total_cents) FILTER (WHERE
          i.invoice_date >= date_trunc('month', (now() AT TIME ZONE 'America/New_York')::date::timestamp)::date
      AND i.invoice_date <  (date_trunc('month', (now() AT TIME ZONE 'America/New_York')::date::timestamp) + interval '1 month')::date
      AND i.status NOT IN ('void', 'draft')), 0::bigint) AS actual_cents
   FROM crm_employees e
     LEFT JOIN crm_invoices i ON i.sales_rep_id = e.id AND i.deleted_at IS NULL
  WHERE e.deleted_at IS NULL AND e.is_sales_rep = true
  GROUP BY e.id, e.org_id, e.first_name, e.last_name, e.sales_goals;
