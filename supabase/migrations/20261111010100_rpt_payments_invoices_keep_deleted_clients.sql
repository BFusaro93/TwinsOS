-- Reports: keep payments / invoices of soft-deleted clients.
--
-- rpt_payments joined clients with `AND c.deleted_at IS NULL`, so deleting a
-- client silently removed every payment they ever made from cash-received and
-- P&L totals — money that really was collected. rpt_invoices and
-- rpt_invoice_line_items had the same join and dropped the matching billed
-- revenue, leaving cash and revenue inconsistent with each other.
--
-- They now LEFT JOIN clients and label a deleted/hidden client '(deleted)'.
-- Column lists, types and security_invoker are unchanged (CREATE OR REPLACE
-- keeps existing grants). Definitions copied from PROD as of 2026-11-11.
--
-- NOT changed (deliberately, listed in the hand-off): the operational views
-- that also INNER JOIN clients with deleted_at IS NULL — rpt_jobs,
-- rpt_job_visits, rpt_job_services, rpt_timesheets, rpt_estimates,
-- rpt_estimate_line_items, rpt_contracts, rpt_contract_service_usage,
-- rpt_projects_wip, rpt_tickets, rpt_client_*, rpt_chemical_applications.
-- rpt_job_visits / rpt_timesheets feed labor-cost totals and likely deserve
-- the same treatment, but they are large, repeatedly redefined views and were
-- out of scope for a cash fix.

create or replace view public.rpt_payments
with (security_invoker = on) as
 SELECT p.id,
    p.payment_date,
    CASE WHEN c.id IS NULL OR c.deleted_at IS NOT NULL THEN '(deleted)' ELSE c.display_name END AS client_name,
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
    COALESCE(p.amount_cents, 0) - COALESCE(p.refunded_amount_cents, 0) AS net_amount_cents
   FROM crm_payments p
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN crm_invoices i ON i.id = p.invoice_id
  WHERE p.deleted_at IS NULL;

create or replace view public.rpt_invoices
with (security_invoker = on) as
 SELECT i.id,
    i.invoice_number,
    i.invoice_date,
    i.due_date,
    i.status,
    CASE WHEN c.id IS NULL OR c.deleted_at IS NOT NULL THEN '(deleted)' ELSE c.display_name END AS client_name,
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
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'void'::text])) AND i.balance_cents > 0 AND i.due_date IS NOT NULL THEN GREATEST(0, (now() AT TIME ZONE org_timezone(i.org_id))::date - i.due_date)
            ELSE 0
        END AS days_overdue,
    i.created_at,
    i.status <> ALL (ARRAY['draft'::text, 'void'::text]) AS is_issued
   FROM crm_invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     LEFT JOIN crm_employees sr ON sr.id = i.sales_rep_id
  WHERE i.deleted_at IS NULL;

create or replace view public.rpt_invoice_line_items
with (security_invoker = on) as
 SELECT li.id,
    i.invoice_number,
    i.invoice_date,
    i.status AS invoice_status,
    CASE WHEN c.id IS NULL OR c.deleted_at IS NOT NULL THEN '(deleted)' ELSE c.display_name END AS client_name,
    li.name,
    li.description,
    li.service_date,
    li.qty,
    li.rate_cents,
    li.total_cents,
    li.is_taxable,
    li.hours,
    li.men,
    i.status <> ALL (ARRAY['draft'::text, 'void'::text]) AS is_issued
   FROM crm_invoice_line_items li
     JOIN crm_invoices i ON i.id = li.invoice_id AND i.deleted_at IS NULL
     LEFT JOIN clients c ON c.id = i.client_id;
