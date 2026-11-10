-- ============================================================
-- WIP: Cost to Date includes labor and overhead (owner decision, bug sweep r10).
--
-- cost_to_date_cents was materials/other only (placed POs, direct items, subcontract costs),
-- while the EAC it is divided by includes labor and overhead (it is seeded from the
-- estimate's all-in cost). % complete and earned revenue therefore ran low on every
-- labor-heavy project. Now:
--   labor    = crew hours on the project's COMPLETED visits (the same per-visit hours
--              rpt_job_visits reports: actual hours, else clock in/out, else start/end time,
--              less breaks, × men) + the project's manual labor_hours, × the project's
--              locked Loaded Labor Rate (projects.burdened_rate_cents);
--   overhead = (materials/other + labor) × the overhead share the EAC was built with:
--              the linked estimates' overhead_cost ÷ their direct cost base
--              (revenue − gross profit), mirroring estimate-calc.ts where overhead is applied
--              to the full cost base. Linked estimates = the seed estimate plus every add-on
--              estimate's approved change order. No estimate → no overhead.
-- Columns appended at the end: material_cost_cents (the old cost to date), labor_hours,
-- labor_cost_cents, overhead_cost_cents. security_invoker stays on.
-- ============================================================

CREATE OR REPLACE VIEW public.rpt_projects_wip
WITH (security_invoker = on) AS
SELECT p.id,
    p.name,
    p.status,
    COALESCE(
        CASE
            WHEN (cl.deleted_at IS NOT NULL) THEN (cl.display_name || ' (deleted)'::text)
            ELSE cl.display_name
        END, p.customer_name) AS client_name,
    p.contract_price AS contract_cents,
    p.estimated_cost_cents AS eac_cents,
    (p.contract_price - p.estimated_cost_cents) AS estimated_gp_cents,
        CASE
            WHEN (p.contract_price > 0) THEN round(((((p.contract_price - p.estimated_cost_cents))::numeric / (p.contract_price)::numeric) * (100)::numeric), 1)
            ELSE NULL::numeric
        END AS estimated_gp_pct,
    cost.cost_to_date_cents,
        CASE
            WHEN (p.estimated_cost_cents > 0) THEN round(((LEAST(cost.cost_to_date_cents, (p.estimated_cost_cents)::numeric) / (p.estimated_cost_cents)::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS pct_complete,
    (round(((p.contract_price)::numeric *
        CASE
            WHEN (p.estimated_cost_cents > 0) THEN (LEAST(cost.cost_to_date_cents, (p.estimated_cost_cents)::numeric) / (p.estimated_cost_cents)::numeric)
            ELSE (0)::numeric
        END)))::integer AS earned_revenue_cents,
    COALESCE(bill.billed_cents, (0)::bigint) AS billed_cents,
    (COALESCE(bill.billed_cents, (0)::bigint) - (round(((p.contract_price)::numeric *
        CASE
            WHEN (p.estimated_cost_cents > 0) THEN (LEAST(cost.cost_to_date_cents, (p.estimated_cost_cents)::numeric) / (p.estimated_cost_cents)::numeric)
            ELSE (0)::numeric
        END)))::integer) AS over_under_billed_cents,
    (p.contract_price - COALESCE(bill.billed_cents, (0)::bigint)) AS remaining_to_bill_cents,
    p.start_date,
    p.end_date,
    p.created_at,
    p.original_contract_price AS original_contract_cents,
    COALESCE(co.approved_change_cents, (0)::bigint) AS approved_changes_cents,
    COALESCE(co.change_order_count, (0)::bigint) AS change_order_count,
    cost.committed_cents,
    p.org_id,
    base.material_cents AS material_cost_cents,
    base.labor_hours,
    base.labor_cents AS labor_cost_cents,
    ovh.overhead_cents AS overhead_cost_cents
   FROM ((((((((((((projects p
     LEFT JOIN clients cl ON ((cl.id = p.client_id)))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(a.line_cents) FILTER (WHERE a.placed), (0)::numeric) AS po_cents,
            COALESCE(sum(a.line_cents) FILTER (WHERE (NOT a.placed)), (0)::numeric) AS po_committed_cents
           FROM ( SELECT (po.status = ANY (ARRAY['ordered'::text, 'partially_fulfilled'::text, 'completed'::text])) AS placed,
                    ((((pli.total_cost)::numeric -
                        CASE
                            WHEN ((COALESCE(po.discount_cost, 0) > 0) AND (tot.sub > (0)::numeric)) THEN round((((pli.total_cost)::numeric / tot.sub) * (po.discount_cost)::numeric))
                            ELSE (0)::numeric
                        END) +
                        CASE
                            WHEN (pli.taxable IS DISTINCT FROM false) THEN round(((((pli.total_cost)::numeric * po.tax_rate_percent) *
                            CASE
                                WHEN (COALESCE(po.discount_reduces_tax, false) AND (tot.taxable_sub > (0)::numeric)) THEN (GREATEST((0)::numeric, (tot.taxable_sub -
                                CASE
                                    WHEN (tot.sub > (0)::numeric) THEN round((((COALESCE(po.discount_cost, 0))::numeric * tot.taxable_sub) / tot.sub))
                                    ELSE (0)::numeric
                                END)) / tot.taxable_sub)
                                ELSE (1)::numeric
                            END) / 100.0))
                            ELSE (0)::numeric
                        END) +
                        CASE
                            WHEN ((po.shipping_cost > 0) AND (tot.sub > (0)::numeric)) THEN round((((pli.total_cost)::numeric / tot.sub) * (po.shipping_cost)::numeric))
                            ELSE (0)::numeric
                        END) AS line_cents
                   FROM ((po_line_items pli
                     JOIN purchase_orders po ON (((po.id = pli.po_id) AND (po.deleted_at IS NULL) AND (po.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'cancelled'::text, 'canceled'::text])))))
                     CROSS JOIN LATERAL ( SELECT (COALESCE(sum(x.total_cost), (0)::bigint))::numeric AS sub,
                            (COALESCE(sum(x.total_cost) FILTER (WHERE (x.taxable IS DISTINCT FROM false)), (0)::bigint))::numeric AS taxable_sub
                           FROM po_line_items x
                          WHERE (x.po_id = po.id)) tot)
                  WHERE (pli.project_id = p.id)) a) po_costs ON (true))
     LEFT JOIN LATERAL ( SELECT ((COALESCE(sum(rli.total_cost), (0)::bigint))::numeric + COALESCE(sum(round((((rli.total_cost)::numeric * r.tax_rate_percent) / 100.0))), (0)::numeric)) AS req_cents
           FROM (requisition_line_items rli
             JOIN requisitions r ON (((r.id = rli.requisition_id) AND (r.deleted_at IS NULL))))
          WHERE ((rli.project_id = p.id) AND (r.status <> ALL (ARRAY['draft'::text, 'rejected'::text, 'closed'::text])) AND (NOT ((r.status = 'ordered'::text) AND (r.converted_po_id IS NOT NULL))) AND (NOT (EXISTS ( SELECT 1
                   FROM (po_line_items x
                     JOIN purchase_orders po2 ON ((po2.id = x.po_id)))
                  WHERE ((po2.requisition_id = r.id) AND (po2.deleted_at IS NULL) AND (po2.status <> ALL (ARRAY['canceled'::text, 'cancelled'::text, 'rejected'::text])) AND (x.project_id = p.id) AND (NOT (x.product_item_id IS DISTINCT FROM rli.product_item_id)))))))) req_costs ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(round((di.quantity * (di.unit_cost)::numeric))), (0)::numeric) AS direct_cents
           FROM project_direct_items di
          WHERE ((di.project_id = p.id) AND (di.deleted_at IS NULL))) direct_costs ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(sc.amount), (0)::bigint) AS subcontract_cents
           FROM project_subcontract_costs sc
          WHERE ((sc.project_id = p.id) AND (sc.deleted_at IS NULL))) sub_costs ON (true))
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(COALESCE(v.actual_hours,
                CASE
                    WHEN ((v.clocked_in_at IS NOT NULL) AND (v.clocked_out_at IS NOT NULL) AND (v.clocked_out_at > v.clocked_in_at)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM (v.clocked_out_at - v.clocked_in_at)) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END,
                CASE
                    WHEN ((v.start_time IS NOT NULL) AND (v.end_time IS NOT NULL) AND (v.end_time <> v.start_time)) THEN (GREATEST((0)::numeric, ((EXTRACT(epoch FROM
                    CASE
                        WHEN (v.end_time > v.start_time) THEN (v.end_time - v.start_time)
                        ELSE ((v.end_time + '24:00:00'::interval) - v.start_time)
                    END) / 3600.0) - ((COALESCE(v.break_minutes, 0))::numeric / 60.0))) * (
                    CASE
                        WHEN (COALESCE(v.men_count, 0) = 0) THEN 1
                        ELSE v.men_count
                    END)::numeric)
                    ELSE NULL::numeric
                END)), (0)::numeric) AS visit_hours
           FROM (crm_job_visits v
             JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
          WHERE ((j.project_id = p.id) AND (v.deleted_at IS NULL) AND (v.status = 'completed'::text))) vis ON (true))
     LEFT JOIN LATERAL ( SELECT (COALESCE(sum(e.overhead_cost_cents), (0)::bigint))::numeric AS overhead_cents,
            (COALESCE(sum(GREATEST(0, (COALESCE(e.revenue_cents, 0) - COALESCE(e.gross_profit_cents, 0)))), (0)::bigint))::numeric AS base_cost_cents
           FROM estimates e
          WHERE ((e.id = p.source_estimate_id) OR (e.id IN ( SELECT c.estimate_id
                   FROM project_change_orders c
                  WHERE ((c.project_id = p.id) AND (c.status = 'approved'::text) AND (c.deleted_at IS NULL) AND (c.estimate_id IS NOT NULL)))))) est_oh ON (true))
     CROSS JOIN LATERAL ( SELECT ((po_costs.po_cents + direct_costs.direct_cents) + (sub_costs.subcontract_cents)::numeric) AS material_cents,
            (vis.visit_hours + COALESCE(p.labor_hours, (0)::numeric)) AS labor_hours,
            round(((vis.visit_hours + COALESCE(p.labor_hours, (0)::numeric)) * (COALESCE(p.burdened_rate_cents, 0))::numeric)) AS labor_cents) base)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (est_oh.base_cost_cents > (0)::numeric) THEN round((((base.material_cents + base.labor_cents) * est_oh.overhead_cents) / est_oh.base_cost_cents))
                    ELSE (0)::numeric
                END AS overhead_cents) ovh)
     CROSS JOIN LATERAL ( SELECT ((base.material_cents + base.labor_cents) + ovh.overhead_cents) AS cost_to_date_cents,
            (po_costs.po_committed_cents + req_costs.req_cents) AS committed_cents) cost)
     LEFT JOIN LATERAL ( SELECT COALESCE(sum(c.amount_cents), (0)::bigint) AS approved_change_cents,
            count(*) AS change_order_count
           FROM project_change_orders c
          WHERE ((c.project_id = p.id) AND (c.status = 'approved'::text) AND (c.deleted_at IS NULL))) co ON (true))
     LEFT JOIN LATERAL ( SELECT (COALESCE(sum(b.revenue_ex_tax_cents), (0)::numeric))::bigint AS billed_cents
           FROM rpt_invoice_link_billing b
          WHERE (b.project_id = p.id)) bill ON (true))
  WHERE (p.deleted_at IS NULL);
