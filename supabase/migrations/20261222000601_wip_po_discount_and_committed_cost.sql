-- WIP report (rpt_projects_wip): PO discounts, and cost to date = spend actually placed.
--
-- 1. The PO cost per project line ignored the PO's discount (and "discount reduces
--    tax"), so cost to date — and with it % complete, earned revenue and
--    over/under billed — read high next to the Projects list and project detail,
--    which allocate the discount per line (src/lib/utils/project-po-allocation.ts).
--    Each project line now takes its share of the PO discount, and when the PO
--    discounts before tax the tax base shrinks the same way allocatePoLine does.
-- 2. Cost to date counted POs still requested / pending / approved and open
--    requisitions, so percent-complete revenue was recognised on spend nobody had
--    committed to a vendor. Cost to date is now POs actually placed (ordered,
--    partially fulfilled, completed) + direct items + subcontract costs; requested /
--    pending / approved POs and open requisitions move to the new committed_cents
--    column. cost_to_date_cents + committed_cents is the Projects list's total.
-- 3. A requisition split into POs by vendor stays 'approved' until every vendor's
--    PO exists, so after a partial split the same project line counted on both the
--    requisition and the new PO. A requisition line now drops out once a live PO
--    created from that requisition carries the same product for the same project.
-- Column list/types otherwise unchanged (committed_cents is appended), so CREATE OR
-- REPLACE keeps grants; security_invoker stays on. Body from the live definition.

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
    cost.committed_cents
   FROM projects p
     LEFT JOIN clients cl ON cl.id = p.client_id
     LEFT JOIN LATERAL ( SELECT
            COALESCE(sum(a.line_cents) FILTER (WHERE a.placed), 0::numeric) AS po_cents,
            COALESCE(sum(a.line_cents) FILTER (WHERE NOT a.placed), 0::numeric) AS po_committed_cents
           FROM ( SELECT po.status = ANY (ARRAY['ordered'::text, 'partially_fulfilled'::text, 'completed'::text]) AS placed,
                    pli.total_cost::numeric
                    - CASE WHEN COALESCE(po.discount_cost, 0) > 0 AND tot.sub > 0
                           THEN round(pli.total_cost::numeric / tot.sub * po.discount_cost::numeric) ELSE 0::numeric END
                    + CASE WHEN pli.taxable IS DISTINCT FROM false
                           THEN round(pli.total_cost::numeric * po.tax_rate_percent *
                                  CASE WHEN COALESCE(po.discount_reduces_tax, false) AND tot.taxable_sub > 0
                                       THEN GREATEST(0::numeric, tot.taxable_sub - COALESCE(po.discount_cost, 0)::numeric) / tot.taxable_sub
                                       ELSE 1::numeric END / 100.0)
                           ELSE 0::numeric END
                    + CASE WHEN po.shipping_cost > 0 AND tot.sub > 0
                           THEN round(pli.total_cost::numeric / tot.sub * po.shipping_cost::numeric) ELSE 0::numeric END
                    AS line_cents
                   FROM po_line_items pli
                     JOIN purchase_orders po ON po.id = pli.po_id AND po.deleted_at IS NULL
                       AND (po.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'cancelled'::text, 'canceled'::text]))
                     CROSS JOIN LATERAL ( SELECT COALESCE(sum(x.total_cost), 0::bigint)::numeric AS sub,
                            COALESCE(sum(x.total_cost) FILTER (WHERE x.taxable IS DISTINCT FROM false), 0::bigint)::numeric AS taxable_sub
                           FROM po_line_items x WHERE x.po_id = po.id) tot
                  WHERE pli.project_id = p.id) a) po_costs ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(rli.total_cost), 0::bigint)::numeric + COALESCE(sum(round(rli.total_cost::numeric * r.tax_rate_percent / 100.0)), 0::numeric) AS req_cents
           FROM requisition_line_items rli
             JOIN requisitions r ON r.id = rli.requisition_id AND r.deleted_at IS NULL
          WHERE rli.project_id = p.id AND (r.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'closed'::text])) AND NOT (r.status = 'ordered'::text AND r.converted_po_id IS NOT NULL)
            AND NOT (EXISTS ( SELECT 1
                   FROM po_line_items x
                     JOIN purchase_orders po2 ON po2.id = x.po_id
                  WHERE po2.requisition_id = r.id AND po2.deleted_at IS NULL
                    AND (po2.status <> ALL (ARRAY['canceled'::text, 'cancelled'::text, 'rejected'::text]))
                    AND x.project_id = p.id AND x.product_item_id IS NOT DISTINCT FROM rli.product_item_id))) req_costs ON true
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
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(i.total_cents - COALESCE(i.tax_cents, 0)), 0::bigint) AS billed_cents
           FROM crm_invoices i
          WHERE i.project_id = p.id AND i.deleted_at IS NULL AND (i.status <> ALL (ARRAY['draft'::text, 'void'::text]))) bill ON true
  WHERE p.deleted_at IS NULL;
