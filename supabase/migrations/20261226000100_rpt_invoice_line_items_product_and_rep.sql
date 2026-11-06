-- rpt_invoice_line_items: append is_product, product_name and sales_rep for the
-- Report Center's "Invoiced Products Report" (SA's Invoiced Products Report).
--
-- A product line is one with crm_invoice_line_items.product_id set — the only
-- writers of product_id are the job-product invoicing paths
-- (src/lib/invoices/create-from-job.ts, src/lib/visits/complete-visit-side-effects.ts);
-- service lines carry service_id and Other Charges carry is_other_charge.
--   is_product   = product_id is not null
--   product_name = the catalog name (product_items.name), falling back to the
--                  line's own name when the catalog row can't be read (a role
--                  without product_items access under RLS); null on non-product lines
--   sales_rep    = the invoice's sales rep, built exactly like rpt_invoices.sales_rep
--
-- Built from the LIVE definition (20261126000100_rpt_money_views_label_deleted_clients.sql).
-- ADDITIVE ONLY: the existing columns keep their names, order and types; the
-- three new columns are appended at the end, so CREATE OR REPLACE is enough
-- and grants are kept. security_invoker stays on, so RLS on the newly joined
-- product_items / crm_employees still applies to the caller.

create or replace view public.rpt_invoice_line_items
with (security_invoker = on) as
SELECT li.id,
    i.invoice_number,
    i.invoice_date,
    i.status AS invoice_status,
        CASE
            WHEN (c.id IS NULL) THEN '(deleted)'::text
            WHEN (c.deleted_at IS NOT NULL) THEN COALESCE(c.display_name || ' (deleted)', '(deleted)'::text)
            ELSE c.display_name
        END AS client_name,
    li.name,
    li.description,
    li.service_date,
    li.qty,
    li.rate_cents,
    li.total_cents,
    li.is_taxable,
    li.hours,
    li.men,
    (i.status <> ALL (ARRAY['draft'::text, 'void'::text])) AS is_issued,
    (li.product_id IS NOT NULL) AS is_product,
        CASE
            WHEN (li.product_id IS NOT NULL) THEN COALESCE(pi.name, li.name, li.description)
            ELSE NULL::text
        END AS product_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep
   FROM ((((crm_invoice_line_items li
     JOIN crm_invoices i ON (((i.id = li.invoice_id) AND (i.deleted_at IS NULL))))
     LEFT JOIN clients c ON ((c.id = i.client_id)))
     LEFT JOIN product_items pi ON ((pi.id = li.product_id)))
     LEFT JOIN crm_employees sr ON ((sr.id = i.sales_rep_id)));
