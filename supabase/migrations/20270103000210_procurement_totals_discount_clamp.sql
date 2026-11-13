-- Round 13 / purchasing F7: a discount larger than the subtotal made a PO or
-- requisition total negative (procurement_totals had no clamp).
--
-- The discount is now clamped to 0 .. subtotal before tax and the grand total
-- are worked out, so the most a discount can do is zero out the lines; tax on
-- the remaining taxable base and shipping still apply. The client mirror is
-- computeSalesTax / effectiveDiscount in src/lib/utils/po-tax.ts.
--
-- Safe to apply to PROD before or after the code deploy.
-- PROD pre-check (rows whose stored totals this will change on the backfill):
--   select 'po', id, po_number, subtotal, discount_cost, grand_total from purchase_orders
--    where deleted_at is null and (discount_cost < 0 or discount_cost > subtotal)
--   union all
--   select 'req', id, requisition_number, subtotal, discount_cost, grand_total from requisitions
--    where deleted_at is null and (discount_cost < 0 or discount_cost > subtotal);
-- A negative discount_cost (used as a surcharge) would be dropped to 0 — check
-- that list is empty or acceptable first.

CREATE OR REPLACE FUNCTION public.procurement_totals(p_subtotal numeric, p_taxable_subtotal numeric, p_tax_rate_percent numeric, p_discount_cost integer, p_discount_reduces_tax boolean, p_shipping_cost integer, OUT subtotal integer, OUT sales_tax integer, OUT grand_total integer)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_taxable  numeric;
  v_discount numeric;
  v_share    numeric := 0;
begin
  subtotal  := round(coalesce(p_subtotal, 0));
  v_taxable := round(coalesce(p_taxable_subtotal, 0));
  -- A discount can take the order down to zero, never below it.
  v_discount := least(greatest(coalesce(p_discount_cost, 0), 0), greatest(subtotal, 0));
  if coalesce(p_discount_reduces_tax, false) and v_discount <> 0 and subtotal > 0 and v_taxable > 0 then
    v_share := round(v_discount * v_taxable / subtotal);
  end if;
  if coalesce(p_discount_reduces_tax, false) then
    v_taxable := greatest(0, v_taxable - v_share);
  end if;
  sales_tax   := round(v_taxable * coalesce(p_tax_rate_percent, 0) / 100);
  grand_total := subtotal - v_discount::integer + sales_tax + coalesce(p_shipping_cost, 0);
end;
$function$;

-- Re-derive the stored totals of any record the clamp changes. The approval
-- RPC flag lets the refresh pass the status / approved-total guards (the
-- figures only become correct; nothing is approved by this).
DO $$
DECLARE
  r record;
BEGIN
  PERFORM set_config('app.approval_rpc', 'on', true);
  FOR r IN
    SELECT 'purchase_order' AS t, id FROM public.purchase_orders
     WHERE deleted_at IS NULL AND (discount_cost < 0 OR discount_cost > subtotal)
    UNION ALL
    SELECT 'requisition', id FROM public.requisitions
     WHERE deleted_at IS NULL AND (discount_cost < 0 OR discount_cost > subtotal)
  LOOP
    PERFORM public._procurement_refresh_totals(r.t, r.id, false);
  END LOOP;
  PERFORM set_config('app.approval_rpc', '', true);
END $$;
