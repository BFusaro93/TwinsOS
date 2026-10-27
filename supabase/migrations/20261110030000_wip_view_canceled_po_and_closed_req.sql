-- rpt_projects_wip: cancelled POs and closed requisitions were still counted as
-- cost to date.
--
-- purchase_orders.status is CHECK-constrained to
--   requested | pending | approved | ordered | canceled | completed | rejected | partially_fulfilled
-- (ONE "l" in "canceled"), but 20261016010000 excluded 'cancelled' (two l's) --
-- a status that can never exist -- so a canceled PO's lines stayed in
-- cost_to_date_cents. Since % complete, earned revenue and over/under billing
-- are all derived from cost_to_date, canceling a PO on a project made the WIP
-- report read the project as further along (and more under-billed) than it is,
-- while the project's own Materials total (use-projects.ts, which spells it
-- "canceled") correctly dropped it.
--
-- Likewise requisitions.status 'closed' means "closed without ordering" and
-- use-projects.ts treats it as dead ("Rejected/closed requisitions are dead --
-- no pending cost"), but the view only excluded draft/rejected.
--
-- Same columns as 20261016010000 -> CREATE OR REPLACE keeps grants. Only the two
-- status lists change; 'cancelled' stays in the PO list as harmless legacy.
--
-- NOT APPLIED by the author -- apply to PROD and TEST together.

create or replace view rpt_projects_wip
with (security_invoker = on) as
select
  p.id,
  p.name,
  p.status,
  coalesce(cl.display_name, p.customer_name) as client_name,
  p.contract_price as contract_cents,
  p.estimated_cost_cents as eac_cents,
  (p.contract_price - p.estimated_cost_cents) as estimated_gp_cents,
  case when p.contract_price > 0
    then round((p.contract_price - p.estimated_cost_cents)::numeric / p.contract_price * 100, 1)
  end as estimated_gp_pct,
  cost.cost_to_date_cents,
  case when p.estimated_cost_cents > 0
    then round(least(cost.cost_to_date_cents, p.estimated_cost_cents)::numeric / p.estimated_cost_cents * 100, 1)
    else 0
  end as pct_complete,
  round(
    p.contract_price * case when p.estimated_cost_cents > 0
      then least(cost.cost_to_date_cents, p.estimated_cost_cents)::numeric / p.estimated_cost_cents
      else 0
    end
  )::int as earned_revenue_cents,
  coalesce(bill.billed_cents, 0) as billed_cents,
  coalesce(bill.billed_cents, 0) - round(
    p.contract_price * case when p.estimated_cost_cents > 0
      then least(cost.cost_to_date_cents, p.estimated_cost_cents)::numeric / p.estimated_cost_cents
      else 0
    end
  )::int as over_under_billed_cents,
  (p.contract_price - coalesce(bill.billed_cents, 0)) as remaining_to_bill_cents,
  p.start_date,
  p.end_date,
  p.created_at,
  p.original_contract_price as original_contract_cents,
  coalesce(co.approved_change_cents, 0) as approved_changes_cents,
  coalesce(co.change_order_count, 0) as change_order_count
from public.projects p
left join public.clients cl on cl.id = p.client_id and cl.deleted_at is null
left join lateral (
  select
    coalesce(sum(pli.total_cost), 0)
      + coalesce(sum(case when pli.taxable is distinct from false
          then round(pli.total_cost * po.tax_rate_percent / 100.0) else 0 end), 0)
      + coalesce(sum(case when po.shipping_cost > 0 and po.subtotal > 0
          then round((pli.total_cost::numeric / po.subtotal) * po.shipping_cost) else 0 end), 0)
    as po_cents
  from public.po_line_items pli
  join public.purchase_orders po on po.id = pli.po_id and po.deleted_at is null
    and po.status not in ('draft', 'rejected', 'cancelled', 'canceled')
  where pli.project_id = p.id
) po_costs on true
left join lateral (
  -- Excludes requisition lines already converted to a PO -- that cost is
  -- already counted via po_costs above (mirrors use-projects.ts).
  select
    coalesce(sum(rli.total_cost), 0)
      + coalesce(sum(round(rli.total_cost * r.tax_rate_percent / 100.0)), 0)
    as req_cents
  from public.requisition_line_items rli
  join public.requisitions r on r.id = rli.requisition_id and r.deleted_at is null
  where rli.project_id = p.id
    and r.status not in ('draft', 'rejected', 'closed')
    and not (r.status = 'ordered' and r.converted_po_id is not null)
) req_costs on true
left join lateral (
  select coalesce(sum(round(di.quantity * di.unit_cost)), 0) as direct_cents
  from public.project_direct_items di
  where di.project_id = p.id and di.deleted_at is null
) direct_costs on true
left join lateral (
  select coalesce(sum(sc.amount), 0) as subcontract_cents
  from public.project_subcontract_costs sc
  where sc.project_id = p.id and sc.deleted_at is null
) sub_costs on true
cross join lateral (
  select (po_costs.po_cents + req_costs.req_cents + direct_costs.direct_cents + sub_costs.subcontract_cents)
    as cost_to_date_cents
) cost
left join lateral (
  select
    coalesce(sum(c.amount_cents), 0) as approved_change_cents,
    count(*)                         as change_order_count
  from public.project_change_orders c
  where c.project_id = p.id and c.status = 'approved' and c.deleted_at is null
) co on true
left join lateral (
  select coalesce(sum(i.total_cents - coalesce(i.tax_cents, 0)), 0) as billed_cents
  from public.crm_invoices i
  where i.project_id = p.id and i.deleted_at is null and i.status not in ('draft', 'void')
) bill on true
where p.deleted_at is null;

notify pgrst, 'reload schema';
