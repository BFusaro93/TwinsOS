-- increment_invoice_totals (SECURITY DEFINER, executable by authenticated) let
-- any CRM login move an invoice's subtotal/total by an arbitrary delta: its
-- only guard was _org_mismatch. That bypassed the invoice write guard in
-- 20261207000200, since a definer RPC's writes are exempt there.
--
-- Its one caller is the visit-completion auto-invoice
-- (src/lib/visits/complete-visit-side-effects.ts), which now always runs as the
-- service role — the crew clock-out/skip routes, the admin backfill and the
-- office complete routes (src/lib/visits/complete-visit.ts). So the RPC now
-- requires acct_add_modify_invoices from an end-user session;
-- _acct_permitted passes the service role and in-database callers.
--
-- Body is the live definition from 20261016030000 with only the permission
-- check added (re-state it on every future CREATE OR REPLACE — see the
-- crm_price_adjustment regression). CREATE OR REPLACE keeps the grants.

CREATE OR REPLACE FUNCTION public.increment_invoice_totals(p_invoice_id uuid, p_delta_cents integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id         uuid;
  v_subtotal       integer;
  v_discount       integer;
  v_discount_type  text;
  v_discount_value integer;
  v_tax_rate_bps   integer;
  v_amount_paid    integer;
  v_taxable_net    integer;
  v_tax_cents      integer;
  v_total_cents    integer;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to modify invoices'
      using errcode = '42501';
  end if;

  if p_delta_cents = 0 then
    return;
  end if;

  select org_id, subtotal_cents, coalesce(discount_cents, 0), discount_type, discount_value, coalesce(tax_rate_bps, 0), coalesce(amount_paid_cents, 0)
    into v_org_id, v_subtotal, v_discount, v_discount_type, v_discount_value, v_tax_rate_bps, v_amount_paid
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  v_subtotal := v_subtotal + p_delta_cents;

  -- A percent document discount (discount_value in bps) is a share of the
  -- CURRENT subtotal, not the frozen snapshot in discount_cents; re-derive it,
  -- then clamp any discount to [0, subtotal] so an appended/removed visit can't
  -- leave an oversized discount driving the total negative. Mirrors
  -- computeInvoiceTotals in src/lib/hooks/use-invoices.ts.
  if v_discount_type = 'percent' then
    v_discount := round(greatest(0, v_subtotal)::numeric * coalesce(v_discount_value, 0) / 10000)::integer;
  end if;
  v_discount := least(greatest(0, v_discount), greatest(0, v_subtotal));

  select coalesce(sum(li.total_cents - coalesce(li.discount_cents, 0)), 0)
    into v_taxable_net
    from public.crm_invoice_line_items li
    where li.invoice_id = p_invoice_id
      and li.is_taxable = true;

  v_tax_cents := round((greatest(0, v_taxable_net - v_discount)::numeric * v_tax_rate_bps) / 10000)::integer;
  v_total_cents := v_subtotal - v_discount + v_tax_cents;

  update public.crm_invoices
  set subtotal_cents = v_subtotal,
      discount_cents = v_discount,
      tax_cents      = v_tax_cents,
      total_cents    = v_total_cents,
      balance_cents  = greatest(0, v_total_cents - v_amount_paid),
      updated_at     = now()
  where id = p_invoice_id;
end;
$function$;
