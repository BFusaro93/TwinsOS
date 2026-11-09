-- Report Center numbers — owner-decided rules (bug sweep round 8, F5):
--   (a) revenue EXCLUDES sales tax everywhere (total − tax);
--   (b) an issued invoice with no due date ages from its invoice date (A/R Aging's rule);
--   (c) invoices consolidated / merged into another count toward the contract,
--       project and estimate they came from.
--
-- 1. rpt_invoices.days_overdue ages from coalesce(due_date, invoice_date) — rule (b). It
--    returned 0 for every invoice with no due date, so Invoices with Balances and the KPI
--    scorecard's "AR over 60 days" disagreed with A/R Aging. Body = live def
--    (20261222000102) with only that expression changed.
-- 2. rpt_invoice_line_items gains (appended) discount_cents, net_total_cents (line total
--    less its own line discount) and revenue_ex_tax_cents: the line's share of the
--    invoice's pre-tax, after-discount total (total − tax), split by the lines' net amounts
--    — the same allocation crm_commission_lines uses (net / net_sum), so the invoice-level
--    discount reaches line-based revenue reports (P&L Accrual, Revenue by Service).
-- 3. rpt_sales_rep_month.actual_cents is now pre-tax (total − tax) — rule (a); the quota
--    gauge compared tax-inclusive sales with a pre-tax goal. Same columns.
-- 4. New view rpt_invoice_link_billing — rule (c). One row per billed charge with the
--    contract / project / estimate link it belongs to:
--      * every live issued invoice, less the part of its total that came from invoices
--        merged into it (crm_merge_invoices keeps the parent's own link, and the parent's
--        total already includes the children's), and
--      * every consolidated / merged source (consolidated_into_id set; the source itself is
--        void + soft-deleted) whose parent is live and issued, with the source's own pre-tax
--        amount and link.
--    Summed over everything it equals the live issued invoices' pre-tax total, so nothing
--    is counted twice. One level only: a source whose parent was itself later merged away
--    is not followed further.
-- 5. rpt_projects_wip.billed_cents reads that view (still pre-tax). Body = live def
--    (20261222000601) with only the `bill` lateral changed.
-- 6. rpt_crew_member_labor_rates() skips soft-deleted crew members (a removed member's rate
--    still weighted the crew's average labor rate). Body = live def + that filter.
-- 7. (Moved.) The crm_run_report service-role time-zone fix lives in 20261227000200,
--    applied on top of the p_joins/p_sorts signature from 20261224000610. Replacing the
--    old 8-argument function here would recreate it beside that one on databases where
--    20261224000610 already ran.

-- 1 ─────────────────────────────────────────────────────────────────────────────────────
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
            WHEN (i.status <> ALL (ARRAY['draft'::text, 'void'::text])) AND i.balance_cents > 0 THEN GREATEST(0, (now() AT TIME ZONE org_timezone(i.org_id))::date - COALESCE(i.due_date, i.invoice_date))
            ELSE 0
        END AS days_overdue,
    i.created_at,
    i.status <> ALL (ARRAY['draft'::text, 'void'::text]) AS is_issued,
    i.total_cents - i.tax_cents AS revenue_ex_tax_cents,
    -- Appended by the Report Center SA-parity work (20261224000600), already live on
    -- PROD/TEST before this migration: kept as the last column so CREATE OR REPLACE works.
    i.client_id,
    -- org_id appended last by the Report Center work (20261226000300), already live.
    i.org_id
   FROM crm_invoices i
     LEFT JOIN clients c ON c.id = i.client_id
     LEFT JOIN crm_employees sr ON sr.id = i.sales_rep_id
  WHERE i.deleted_at IS NULL;

-- 2 ─────────────────────────────────────────────────────────────────────────────────────
-- The Report Center SA-parity work appended is_product / product_name / sales_rep to this
-- view on PROD (and after this migration's columns on TEST), so column positions differ
-- between environments. Drop and recreate with every column, in one order, everywhere.
-- Nothing depends on this view.
drop view if exists public.rpt_invoice_line_items;
create view public.rpt_invoice_line_items
with (security_invoker = on) as
 SELECT li.id,
    i.invoice_number,
    i.invoice_date,
    i.status AS invoice_status,
        CASE
            WHEN c.id IS NULL THEN '(deleted)'::text
            WHEN c.deleted_at IS NOT NULL THEN COALESCE(c.display_name || ' (deleted)'::text, '(deleted)'::text)
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
    i.status <> ALL (ARRAY['draft'::text, 'void'::text]) AS is_issued,
    li.product_id IS NOT NULL AS is_product,
        CASE
            WHEN li.product_id IS NOT NULL THEN COALESCE(pi.name, li.name, li.description)
            ELSE NULL::text
        END AS product_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    li.discount_cents,
    li.total_cents - li.discount_cents AS net_total_cents,
        CASE
            WHEN ns.net_sum > 0 THEN round((i.total_cents - i.tax_cents)::numeric * GREATEST(li.total_cents - li.discount_cents, 0)::numeric / ns.net_sum)::bigint
            ELSE 0::bigint
        END AS revenue_ex_tax_cents,
    li.org_id
   FROM crm_invoice_line_items li
     JOIN crm_invoices i ON i.id = li.invoice_id AND i.deleted_at IS NULL
     LEFT JOIN clients c ON c.id = i.client_id
     LEFT JOIN product_items pi ON pi.id = li.product_id
     LEFT JOIN crm_employees sr ON sr.id = i.sales_rep_id
     -- correlated (not a window function) so invoice_date / is_issued filters still push down
     CROSS JOIN LATERAL ( SELECT COALESCE(sum(GREATEST(x.total_cents - x.discount_cents, 0)), 0::bigint)::numeric AS net_sum
           FROM crm_invoice_line_items x
          WHERE x.invoice_id = li.invoice_id) ns;

grant select on public.rpt_invoice_line_items to authenticated, service_role;

-- 3 ─────────────────────────────────────────────────────────────────────────────────────
create or replace view public.rpt_sales_rep_month
with (security_invoker = on) as
 SELECT e.id AS employee_id,
    e.org_id,
    NULLIF(TRIM(BOTH FROM concat(e.first_name, ' ', e.last_name)), ''::text) AS sales_rep,
    COALESCE((e.sales_goals ->> lower(to_char((now() AT TIME ZONE org_timezone(e.org_id))::date::timestamp with time zone, 'Mon'::text)))::numeric, 0::numeric)::bigint AS goal_cents,
    COALESCE(sum(i.total_cents - i.tax_cents) FILTER (WHERE i.invoice_date >= date_trunc('month'::text, (now() AT TIME ZONE org_timezone(e.org_id))::date::timestamp without time zone)::date AND i.invoice_date < (date_trunc('month'::text, (now() AT TIME ZONE org_timezone(e.org_id))::date::timestamp without time zone) + '1 mon'::interval)::date AND (i.status <> ALL (ARRAY['void'::text, 'draft'::text]))), 0::bigint) AS actual_cents
   FROM crm_employees e
     LEFT JOIN crm_invoices i ON i.sales_rep_id = e.id AND i.deleted_at IS NULL
  WHERE e.deleted_at IS NULL AND e.is_sales_rep = true
  GROUP BY e.id, e.org_id, e.first_name, e.last_name, e.sales_goals;

-- 4 ─────────────────────────────────────────────────────────────────────────────────────
create or replace view public.rpt_invoice_link_billing
with (security_invoker = on) as
 SELECT i.id AS invoice_id,
    i.id AS billed_invoice_id,
    i.org_id,
    i.contract_id,
    i.project_id,
    i.estimate_id,
    i.invoice_date,
    ((i.total_cents - i.tax_cents) - COALESCE(ch.children_ex_tax_cents, 0::bigint))::bigint AS revenue_ex_tax_cents,
    false AS is_consolidated_source
   FROM crm_invoices i
     LEFT JOIN LATERAL ( SELECT sum(c.total_cents - c.tax_cents) AS children_ex_tax_cents
           FROM crm_invoices c
          WHERE c.consolidated_into_id = i.id) ch ON true
  WHERE i.deleted_at IS NULL AND (i.status <> ALL (ARRAY['draft'::text, 'void'::text]))
UNION ALL
 SELECT c.id AS invoice_id,
    p.id AS billed_invoice_id,
    c.org_id,
    c.contract_id,
    c.project_id,
    c.estimate_id,
    p.invoice_date,
    (c.total_cents - c.tax_cents)::bigint AS revenue_ex_tax_cents,
    true AS is_consolidated_source
   FROM crm_invoices c
     JOIN crm_invoices p ON p.id = c.consolidated_into_id AND p.deleted_at IS NULL AND (p.status <> ALL (ARRAY['draft'::text, 'void'::text]))
  -- explicit so the planner can use the small crm_invoices_consolidated_into_idx partial index
  WHERE c.consolidated_into_id IS NOT NULL;

revoke all on public.rpt_invoice_link_billing from anon;
grant select on public.rpt_invoice_link_billing to authenticated, service_role;

comment on view public.rpt_invoice_link_billing is
  'Pre-tax billed amounts attributed to the contract / project / estimate they belong to, counting invoices consolidated or merged into another (rule c). Sums to the live issued invoices'' total − tax.';

-- 5 ─────────────────────────────────────────────────────────────────────────────────────
create or replace view public.rpt_projects_wip
with (security_invoker = on) as
 SELECT p.id,
    p.name,
    p.status,
    COALESCE(
        CASE
            WHEN cl.deleted_at IS NOT NULL THEN cl.display_name || ' (deleted)'::text
            ELSE cl.display_name
        END, p.customer_name) AS client_name,
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
    p.created_at,
    p.original_contract_price AS original_contract_cents,
    COALESCE(co.approved_change_cents, 0::bigint) AS approved_changes_cents,
    COALESCE(co.change_order_count, 0::bigint) AS change_order_count,
    cost.committed_cents,
    -- org_id appended last by the Report Center work (20261226000300), already live.
    p.org_id
   FROM projects p
     LEFT JOIN clients cl ON cl.id = p.client_id
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(a.line_cents) FILTER (WHERE a.placed), 0::numeric) AS po_cents,
            COALESCE(sum(a.line_cents) FILTER (WHERE NOT a.placed), 0::numeric) AS po_committed_cents
           FROM ( SELECT po.status = ANY (ARRAY['ordered'::text, 'partially_fulfilled'::text, 'completed'::text]) AS placed,
                    pli.total_cost::numeric -
                        CASE
                            WHEN COALESCE(po.discount_cost, 0) > 0 AND tot.sub > 0::numeric THEN round(pli.total_cost::numeric / tot.sub * po.discount_cost::numeric)
                            ELSE 0::numeric
                        END +
                        CASE
                            WHEN pli.taxable IS DISTINCT FROM false THEN round(pli.total_cost::numeric * po.tax_rate_percent *
                            CASE
                                WHEN COALESCE(po.discount_reduces_tax, false) AND tot.taxable_sub > 0::numeric THEN GREATEST(0::numeric, tot.taxable_sub - COALESCE(po.discount_cost, 0)::numeric) / tot.taxable_sub
                                ELSE 1::numeric
                            END / 100.0)
                            ELSE 0::numeric
                        END +
                        CASE
                            WHEN po.shipping_cost > 0 AND tot.sub > 0::numeric THEN round(pli.total_cost::numeric / tot.sub * po.shipping_cost::numeric)
                            ELSE 0::numeric
                        END AS line_cents
                   FROM po_line_items pli
                     JOIN purchase_orders po ON po.id = pli.po_id AND po.deleted_at IS NULL AND (po.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'cancelled'::text, 'canceled'::text]))
                     CROSS JOIN LATERAL ( SELECT COALESCE(sum(x.total_cost), 0::bigint)::numeric AS sub,
                            COALESCE(sum(x.total_cost) FILTER (WHERE x.taxable IS DISTINCT FROM false), 0::bigint)::numeric AS taxable_sub
                           FROM po_line_items x
                          WHERE x.po_id = po.id) tot
                  WHERE pli.project_id = p.id) a) po_costs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(rli.total_cost), 0::bigint)::numeric + COALESCE(sum(round(rli.total_cost::numeric * r.tax_rate_percent / 100.0)), 0::numeric) AS req_cents
           FROM requisition_line_items rli
             JOIN requisitions r ON r.id = rli.requisition_id AND r.deleted_at IS NULL
          WHERE rli.project_id = p.id AND (r.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'closed'::text])) AND NOT (r.status = 'ordered'::text AND r.converted_po_id IS NOT NULL) AND NOT (EXISTS ( SELECT 1
                   FROM po_line_items x
                     JOIN purchase_orders po2 ON po2.id = x.po_id
                  WHERE po2.requisition_id = r.id AND po2.deleted_at IS NULL AND (po2.status <> ALL (ARRAY['canceled'::text, 'cancelled'::text, 'rejected'::text])) AND x.project_id = p.id AND NOT x.product_item_id IS DISTINCT FROM rli.product_item_id))) req_costs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(round(di.quantity * di.unit_cost::numeric)), 0::numeric) AS direct_cents
           FROM project_direct_items di
          WHERE di.project_id = p.id AND di.deleted_at IS NULL) direct_costs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(sc.amount), 0::bigint) AS subcontract_cents
           FROM project_subcontract_costs sc
          WHERE sc.project_id = p.id AND sc.deleted_at IS NULL) sub_costs ON true
     CROSS JOIN LATERAL ( SELECT po_costs.po_cents + direct_costs.direct_cents + sub_costs.subcontract_cents::numeric AS cost_to_date_cents,
            po_costs.po_committed_cents + req_costs.req_cents AS committed_cents) cost
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(c.amount_cents), 0::bigint) AS approved_change_cents,
            count(*) AS change_order_count
           FROM project_change_orders c
          WHERE c.project_id = p.id AND c.status = 'approved'::text AND c.deleted_at IS NULL) co ON true
     -- pre-tax billed, incl. invoices consolidated / merged into another (rule c)
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(b.revenue_ex_tax_cents), 0::numeric)::bigint AS billed_cents
           FROM rpt_invoice_link_billing b
          WHERE b.project_id = p.id) bill ON true
  WHERE p.deleted_at IS NULL;

-- 6 ─────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpt_crew_member_labor_rates()
 RETURNS TABLE(org_id uuid, crew_id uuid, rate numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.org_id,
         m.crew_id,
         case
           when coalesce(m.labor_burden_cents_per_hour, 0) > 0 then m.labor_burden_cents_per_hour::numeric
           else coalesce(e.hourly_rate_cents, 0)::numeric * (1 + coalesce(os.labor_burden_bps, 0)::numeric / 10000.0)
         end as rate
  from public.crm_crew_members m
  left join public.crm_employees e on e.id = m.employee_id and e.deleted_at is null
  left join public.crm_overhead_settings os on os.org_id = m.org_id
  where m.deleted_at is null
    and (auth.role() = 'service_role'
         or (public.my_org_id() is not null and m.org_id = public.my_org_id()));
$function$;
