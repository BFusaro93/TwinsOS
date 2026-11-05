-- Sales Commission Export read rpt_invoices.subtotal_cents, which is BEFORE the invoice-level
-- discount, so paying commission from it overpaid every discounted invoice. Add the same
-- pre-tax, after-discount figure the commission engine uses (total - tax) as a new last
-- column; the rest of the view is the live definition (20261126000100) unchanged. The rep
-- column already reads crm_invoices.sales_rep_id, which is now stamped at issue
-- (20261222000100), so issued invoices whose rep came from the job / contract / estimate /
-- client no longer show a blank rep.
create or replace view public.rpt_invoices
with (security_invoker = on) as
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
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'void'::text])) AND i.balance_cents > 0 AND i.due_date IS NOT NULL THEN GREATEST(0, (now() AT TIME ZONE org_timezone(i.org_id))::date - i.due_date)
            ELSE 0
        END AS days_overdue,
    i.created_at,
    i.status <> ALL (ARRAY['draft'::text, 'void'::text]) AS is_issued,
    i.total_cents - i.tax_cents AS revenue_ex_tax_cents
   FROM crm_invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     LEFT JOIN crm_employees sr ON sr.id = i.sales_rep_id
  WHERE i.deleted_at IS NULL;
