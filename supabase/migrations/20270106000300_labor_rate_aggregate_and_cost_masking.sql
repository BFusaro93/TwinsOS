-- Pay rates / labor cost: no per-person rate reaches an end user, and labor
-- cost columns in the report views are masked for roles without a costing key.
--
-- 1. crm_can_see_labor_cost(): the one rule for "may this caller see labor
--    cost / crew labor rates". The service role, admins (has_settings_permission
--    passes them), and holders of any of payroll_show_wage_burden,
--    sched_rpt_job_costing, sched_rpt_job_cost_summary, sched_rpt_cogs — plus the
--    two Profit & Loss keys, whose Labor line is summed from rpt_job_visits and
--    would otherwise read $0 for an accountant role.
-- 2. rpt_crew_labor_rates() replaces rpt_crew_member_labor_rates(): one row per
--    CREW (org_id, crew_id, avg_rate, members) instead of one per member, and
--    avg_rate is NULL unless crm_can_see_labor_cost(). The old per-member
--    function (any login, crew included, got each person's rate) is dropped.
-- 3. crm_job_visit_labor_costs(): the stored per-visit labor cost, readable only
--    through this gate, so rpt_job_visits no longer reads
--    crm_job_visits.actual_labor_cost_cents with the caller's privileges (the
--    column's direct SELECT is revoked later, 20270106000390, after the deploy).
-- 4. rpt_job_visits.actual_labor_cost_cents and rpt_projects_wip.labor_cost_cents
--    are NULL unless crm_can_see_labor_cost() (same idea as rpt_timesheets,
--    whose rates come from the gated crm_crew_member_labor_rates()).
-- 5. Crew logins don't see product unit cost (rpt_products.unit_cost) or service
--    rates (rpt_services default/target rates).
--
-- Safe BEFORE the deploy: every view keeps its columns, names and types; no
-- application code calls rpt_crew_member_labor_rates().

create or replace function public.crm_can_see_labor_cost()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (select public.has_settings_permission('payroll_show_wage_burden'))
      or (select public.has_settings_permission('sched_rpt_job_costing'))
      or (select public.has_settings_permission('sched_rpt_job_cost_summary'))
      or (select public.has_settings_permission('sched_rpt_cogs'))
      or (select public.has_settings_permission('acct_rpt_profit_loss_accrual'))
      or (select public.has_settings_permission('acct_rpt_profit_loss_cash'));
$$;

revoke all on function public.crm_can_see_labor_cost() from public, anon;
grant execute on function public.crm_can_see_labor_cost() to authenticated, service_role;

-- Crew-level labor rate: the average fully loaded rate of the crew's members
-- that have a rate (members = how many), so an org-wide average can still be
-- weighted per member. Same per-member rule as crm_crew_member_labor_rates()
-- (crm_labor_rate_cents). The rate is NULL for callers without the gate.
create or replace function public.rpt_crew_labor_rates()
returns table(org_id uuid, crew_id uuid, avg_rate numeric, members integer)
language sql
stable
security definer
set search_path = public
as $$
  with gate as (
    select public.crm_can_see_labor_cost() as ok
  ), member_rates as (
    select m.org_id,
           m.crew_id,
           public.crm_labor_rate_cents(m.labor_burden_cents_per_hour, e.hourly_rate_cents, os.labor_burden_bps)::numeric as rate
      from public.crm_crew_members m
      left join public.crm_employees e on e.id = m.employee_id
      left join public.crm_overhead_settings os on os.org_id = m.org_id
     where m.deleted_at is null
       and (auth.role() = 'service_role'
            or ((select public.my_org_id()) is not null and m.org_id = (select public.my_org_id())))
  )
  select r.org_id,
         r.crew_id,
         case when (select ok from gate) then avg(r.rate) end as avg_rate,
         count(*)::integer as members
    from member_rates r
   where r.rate > 0
   group by r.org_id, r.crew_id;
$$;

revoke all on function public.rpt_crew_labor_rates() from public, anon;
grant execute on function public.rpt_crew_labor_rates() to authenticated, service_role;

-- Stored per-visit labor cost (recomputeStopLabor / clock-out writes it with the
-- service role), only for gated callers in their own org.
create or replace function public.crm_job_visit_labor_costs()
returns table(visit_id uuid, actual_labor_cost_cents integer)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.actual_labor_cost_cents
    from public.crm_job_visits v
   where v.actual_labor_cost_cents > 0
     and v.deleted_at is null
     and (select public.crm_can_see_labor_cost())
     and (auth.role() = 'service_role'
          or ((select public.my_org_id()) is not null and v.org_id = (select public.my_org_id())));
$$;

revoke all on function public.crm_job_visit_labor_costs() from public, anon;
grant execute on function public.crm_job_visit_labor_costs() to authenticated, service_role;

create or replace view public.rpt_job_visits with (security_invoker = on) as
 WITH crew_rates AS (
         SELECT r.org_id,
            r.crew_id,
            r.avg_rate,
            r.members
           FROM rpt_crew_labor_rates() r(org_id, crew_id, avg_rate, members)
        ), perm AS (
         SELECT crm_can_see_labor_cost() AS can_see_labor_cost
        ), visit_costs AS (
         SELECT c.visit_id,
            c.actual_labor_cost_cents
           FROM crm_job_visit_labor_costs() c(visit_id, actual_labor_cost_cents)
        )
 SELECT v.id,
    v.scheduled_date,
    v.completed_at,
    COALESCE(((v.completed_at AT TIME ZONE org_timezone(v.org_id)))::date, v.scheduled_date) AS worked_date,
    v.status,
    v.sub_status,
        CASE
            WHEN (c.deleted_at IS NOT NULL) THEN (c.display_name || ' (deleted)'::text)
            ELSE c.display_name
        END AS client_name,
    COALESCE(s.service_name, ( SELECT string_agg(js.service_name, ', '::text ORDER BY js.sort_order) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id))) AS service_names,
    cw.name AS crew_name,
    NULLIF(TRIM(BOTH FROM concat(sr.first_name, ' ', sr.last_name)), ''::text) AS sales_rep,
    COALESCE(v.men_count, 1) AS men_count,
    (COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) AS budgeted_hours,
    calc.actual_hours,
    calc.actual_hours AS man_hours,
    calc.rate_cents,
        CASE
            WHEN v.crew_group_secondary THEN 0
            ELSE calc.revenue_cents
        END AS revenue_cents,
        CASE
            WHEN perm.can_see_labor_cost THEN labor.labor_cost_cents
            ELSE NULL::integer
        END AS actual_labor_cost_cents,
    labor.labor_cost_source,
        CASE
            WHEN (calc.actual_hours > (0)::numeric) THEN (round(((
            CASE
                WHEN v.crew_group_secondary THEN 0
                ELSE calc.revenue_cents
            END)::numeric / calc.actual_hours)))::bigint
            ELSE NULL::bigint
        END AS rev_per_man_hr_cents,
        CASE
            WHEN (((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) IS NOT NULL) AND (calc.actual_hours IS NOT NULL)) THEN round(((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n) - calc.actual_hours), 2)
            ELSE NULL::numeric
        END AS variance_hours,
    COALESCE(j.service_city, c.service_city) AS service_city,
    COALESCE(j.service_zip, c.service_zip) AS service_zip,
    v.skip_reason,
    v.clocked_in_at,
    v.clocked_out_at,
    ( SELECT string_agg(DISTINCT js.budget_method, ', '::text) AS string_agg
           FROM crm_job_services js
          WHERE (js.job_id = j.id)) AS budget_methods,
    COALESCE(cs.code, ( SELECT string_agg(csv.code, ', '::text ORDER BY js2.sort_order) AS string_agg
           FROM (crm_job_services js2
             JOIN crm_services csv ON ((csv.id = js2.service_id)))
          WHERE ((js2.job_id = j.id) AND (csv.code IS NOT NULL)))) AS service_code,
    (round(((
        CASE
            WHEN v.crew_group_secondary THEN 0
            ELSE calc.revenue_cents
        END)::numeric / NULLIF((COALESCE(v.budgeted_hours, (s.budgeted_hours * (s.team_size)::numeric), j.budgeted_hours) / grp.n), (0)::numeric))))::bigint AS budgeted_rev_per_man_hr_cents,
    v.org_id,
    COALESCE(to_char((v.clocked_in_at AT TIME ZONE org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.start_time)::interval, 'HH12:MI AM'::text)) AS actual_start_time,
    COALESCE(to_char((v.clocked_out_at AT TIME ZONE org_timezone(v.org_id)), 'HH12:MI AM'::text), to_char((v.end_time)::interval, 'HH12:MI AM'::text)) AS actual_stop_time,
    v.crew_group_id,
    v.crew_group_secondary
   FROM ((((((((((((crm_job_visits v
     CROSS JOIN perm)
     LEFT JOIN visit_costs vc ON ((vc.visit_id = v.id)))
     JOIN crm_jobs j ON (((j.id = v.job_id) AND (j.deleted_at IS NULL))))
     LEFT JOIN clients c ON ((c.id = COALESCE(v.client_id, j.client_id))))
     LEFT JOIN crm_crews cw ON ((cw.id =
        CASE
            WHEN v.crew_unassigned THEN NULL::uuid
            ELSE COALESCE(v.crew_id, j.crew_id)
        END)))
     LEFT JOIN crm_employees sr ON ((sr.id = j.sales_rep_id)))
     LEFT JOIN crm_job_services s ON ((s.id = v.job_service_id)))
     LEFT JOIN crm_services cs ON ((cs.id = s.service_id)))
     CROSS JOIN LATERAL ( SELECT (sum(js.rate_cents))::integer AS rate_sum_cents,
            (sum(((js.rate_cents)::numeric * COALESCE(NULLIF(js.qty, (0)::numeric), (1)::numeric))))::integer AS revenue_sum_cents
           FROM crm_job_services js
          WHERE ((js.job_id = j.id) AND COALESCE(js.included, true))) svc_sum)
     CROSS JOIN LATERAL ( SELECT COALESCE(v.actual_hours,
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
                END) AS actual_hours,
                CASE
                    WHEN (v.job_service_id IS NOT NULL) THEN COALESCE((((v.rate_cents)::numeric * COALESCE(NULLIF(v.qty, (0)::numeric), (1)::numeric)))::integer, (((s.rate_cents)::numeric * COALESCE(NULLIF(s.qty, (0)::numeric), (1)::numeric)))::integer, 0)
                    ELSE COALESCE(svc_sum.revenue_sum_cents, (((v.rate_cents)::numeric * COALESCE(NULLIF(v.qty, (0)::numeric), (1)::numeric)))::integer, j.rate_cents, 0)
                END AS revenue_cents,
                CASE
                    WHEN (v.job_service_id IS NOT NULL) THEN COALESCE(v.rate_cents, s.rate_cents)
                    ELSE COALESCE(svc_sum.rate_sum_cents, v.rate_cents, j.rate_cents)
                END AS rate_cents) calc)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (COALESCE(vc.actual_labor_cost_cents, 0) > 0) THEN vc.actual_labor_cost_cents
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN (round((calc.actual_hours * COALESCE(rates.crew_rate, rates.org_rate))))::integer
                    ELSE 0
                END AS labor_cost_cents,
                CASE
                    WHEN (COALESCE(vc.actual_labor_cost_cents, 0) > 0) THEN 'actual'::text
                    WHEN ((calc.actual_hours IS NOT NULL) AND (COALESCE(rates.crew_rate, rates.org_rate) > (0)::numeric)) THEN 'estimated'::text
                    ELSE 'none'::text
                END AS labor_cost_source
           FROM ( SELECT ( SELECT cr.avg_rate
                           FROM crew_rates cr
                          WHERE ((cr.crew_id =
                                CASE
                                    WHEN v.crew_unassigned THEN NULL::uuid
                                    ELSE COALESCE(v.crew_id, j.crew_id)
                                END) AND (cr.avg_rate > (0)::numeric))) AS crew_rate,
                    ( SELECT (sum((cr.avg_rate * (cr.members)::numeric)) / (NULLIF(sum(cr.members), 0))::numeric)
                           FROM crew_rates cr
                          WHERE ((cr.org_id = v.org_id) AND (cr.avg_rate > (0)::numeric))) AS org_rate) rates) labor)
     CROSS JOIN LATERAL ( SELECT
                CASE
                    WHEN (v.crew_group_id IS NULL) THEN (1)::numeric
                    ELSE GREATEST((1)::numeric, (( SELECT count(*) AS count
                       FROM crm_job_visits g
                      WHERE ((g.crew_group_id = v.crew_group_id) AND (g.deleted_at IS NULL) AND (g.status <> 'cancelled'::text))))::numeric)
                END AS n) grp)
  WHERE (v.deleted_at IS NULL);

drop function if exists public.rpt_crew_member_labor_rates();

create or replace view public.rpt_projects_wip with (security_invoker = on) as
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
        CASE
            WHEN ( SELECT crm_can_see_labor_cost() AS crm_can_see_labor_cost) THEN base.labor_cents
            ELSE NULL::numeric
        END AS labor_cost_cents,
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

create or replace view public.rpt_products with (security_invoker = on) as
 SELECT id,
    name,
    part_number,
    category,
    part_category,
        CASE
            WHEN (( SELECT my_role() AS my_role) IS DISTINCT FROM 'crew'::text) THEN unit_cost
            ELSE NULL::integer
        END AS unit_cost,
    price,
    vendor_name,
    is_inventory,
    quantity_on_hand,
    minimum_stock,
    org_id
   FROM product_items p
  WHERE (deleted_at IS NULL);

create or replace view public.rpt_services with (security_invoker = on) as
 SELECT id,
    name,
    code,
    category,
    unit,
        CASE
            WHEN (( SELECT my_role() AS my_role) IS DISTINCT FROM 'crew'::text) THEN default_rate_cents
            ELSE NULL::integer
        END AS default_rate_cents,
    production_rate_sqft_per_hr,
        CASE
            WHEN (( SELECT my_role() AS my_role) IS DISTINCT FROM 'crew'::text) THEN target_rate_cents_per_hr
            ELSE NULL::integer
        END AS target_rate_cents_per_hr,
        CASE
            WHEN (( SELECT my_role() AS my_role) IS DISTINCT FROM 'crew'::text) THEN target_rate_with_drive_cents_per_hr
            ELSE NULL::integer
        END AS target_rate_with_drive_cents_per_hr,
    is_taxable,
    is_active,
    org_id
   FROM crm_services s
  WHERE (deleted_at IS NULL);

notify pgrst, 'reload schema';
