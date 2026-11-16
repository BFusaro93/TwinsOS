-- Requestors don't see Equipt costs (owner decision, bug sweep round 14).
--
-- The Requestor role is "maintenance requests + draft requisitions only".
-- Until now it could read work-order labor rates, part unit costs and FIFO
-- cost layers, PO line prices and totals, receipt prices and vendor charges.
--
-- Every user is the same Postgres role (authenticated), so a column grant
-- can't single out requestors; RLS hides the cost-bearing ROWS from them
-- instead (same pattern as crew_no_select on projects). One RESTRICTIVE
-- SELECT policy, requestor_no_costs, on:
--   wo_parts, wo_labor_entries, wo_vendor_charges  — work-order costs
--   parts                                          — unit_cost, cost_layers
--   pm_schedule_parts, pm_schedule_asset_parts     — PM part unit costs
--   purchase_orders, po_line_items                 — PO prices and totals
--   goods_receipts, goods_receipt_lines            — receipt prices
-- Views (rpt_*, wo_part_shortfalls) are security_invoker and
-- cmms_asset_metrics is SECURITY INVOKER, so they follow these policies.
--
-- Viewer and Purchaser keep seeing costs. Requestors still see their own
-- requisitions' line prices (they type them) and the product catalog (they
-- pick from it to draft requisitions) — see the round-14 report.
--
-- Requestors have no write access to any of these tables (role_write_guard_*),
-- so hiding the rows can't break a requestor write. A requestor deleting their
-- own DRAFT requisition counts the POs made from it; a draft never has any.
--
-- DEPLOY: BEFORE the code deploy. Old code just shows requestors empty cost
-- lists until the new UI hides those screens.

do $$
declare
  t text;
begin
  foreach t in array array[
    'wo_parts', 'wo_labor_entries', 'wo_vendor_charges',
    'parts', 'pm_schedule_parts', 'pm_schedule_asset_parts',
    'purchase_orders', 'po_line_items',
    'goods_receipts', 'goods_receipt_lines'
  ] loop
    execute format('drop policy if exists requestor_no_costs on public.%I', t);
    execute format(
      'create policy requestor_no_costs on public.%I as restrictive for select to authenticated '
      || 'using (coalesce((select public.my_role()), '''') <> ''requestor'')',
      t
    );
  end loop;
end $$;
