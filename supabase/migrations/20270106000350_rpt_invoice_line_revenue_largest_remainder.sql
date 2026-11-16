-- rpt_invoice_line_items.revenue_ex_tax_cents: lines add up to the invoice.
--
-- Each line's share of the invoice's pre-tax revenue (total_cents - tax_cents,
-- rpt_invoices.revenue_ex_tax_cents) was rounded on its own, so an invoice's
-- lines could sum a cent or two off the invoice and revenue-by-service / by
-- product reports disagreed with invoice totals. Now largest-remainder: every
-- line gets the floor of its exact share, and the cents left over go one each
-- to the lines with the largest fractional parts (ties: lowest line id). Lines
-- with nothing to share (net <= 0) stay 0. An invoice whose lines all net to 0
-- still reports 0 per line, as before.
--
-- Safe BEFORE the deploy: same columns and types.

create or replace view public.rpt_invoice_line_items with (security_invoker = on) as
 SELECT li.id,
    i.invoice_number,
    i.invoice_date,
    i.status AS invoice_status,
        CASE
            WHEN (c.id IS NULL) THEN '(deleted)'::text
            WHEN (c.deleted_at IS NOT NULL) THEN COALESCE((c.display_name || ' (deleted)'::text), '(deleted)'::text)
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
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    li.discount_cents,
    (li.total_cents - li.discount_cents) AS net_total_cents,
        CASE
            WHEN (ns.net_sum > (0)::numeric) THEN ((floor(me.share) + (
            CASE
                WHEN (lr.ahead < (((i.total_cents - i.tax_cents))::numeric - lr.floor_sum)) THEN 1
                ELSE 0
            END)::numeric))::bigint
            ELSE (0)::bigint
        END AS revenue_ex_tax_cents,
    li.org_id
   FROM (((((((crm_invoice_line_items li
     JOIN crm_invoices i ON (((i.id = li.invoice_id) AND (i.deleted_at IS NULL))))
     LEFT JOIN clients c ON ((c.id = i.client_id)))
     LEFT JOIN product_items pi ON ((pi.id = li.product_id)))
     LEFT JOIN crm_employees sr ON ((sr.id = i.sales_rep_id)))
     CROSS JOIN LATERAL ( SELECT (COALESCE(sum(GREATEST((x.total_cents - x.discount_cents), 0)), (0)::bigint))::numeric AS net_sum
           FROM crm_invoice_line_items x
          WHERE (x.invoice_id = li.invoice_id)) ns)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (ns.net_sum > (0)::numeric) THEN ((((i.total_cents - i.tax_cents))::numeric * (GREATEST((li.total_cents - li.discount_cents), 0))::numeric) / ns.net_sum)
                    ELSE (0)::numeric
                END AS share) me)
     CROSS JOIN LATERAL ( SELECT COALESCE(sum(floor(q.share)), (0)::numeric) AS floor_sum,
            count(*) FILTER (WHERE (((q.share - floor(q.share)) > (me.share - floor(me.share))) OR (((q.share - floor(q.share)) = (me.share - floor(me.share))) AND (x.id < li.id)))) AS ahead
           FROM (crm_invoice_line_items x
             CROSS JOIN LATERAL ( SELECT ((((i.total_cents - i.tax_cents))::numeric * (GREATEST((x.total_cents - x.discount_cents), 0))::numeric) / ns.net_sum) AS share) q)
          WHERE ((x.invoice_id = li.invoice_id) AND (ns.net_sum > (0)::numeric))) lr);
