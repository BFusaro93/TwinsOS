-- A8: increment_invoice_totals (visit-completion auto-invoice appending a visit
-- to an open draft) kept the stored discount_cents as-is. For a percent
-- discount that is a stale snapshot, and for any discount it could exceed the
-- new subtotal. It now re-derives a percent discount from discount_type /
-- discount_value (bps of the new subtotal) and clamps the discount to the
-- subtotal, writing discount_cents back, matching computeInvoiceTotals() in
-- src/lib/hooks/use-invoices.ts.
--
-- Body is the live definition from 20260928100000 (the _org_mismatch guard
-- stays) with only the discount handling added; CREATE OR REPLACE keeps the
-- existing grants (anon revoked in 20260913160000).

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


-- Backstop: an invoice total can never be negative. NOT VALID so it applies to
-- new and updated rows only and does not scan or fail on any historical row.
-- It is deliberately NOT validated here: run
--   select count(*) from crm_invoices where total_cents < 0;
-- first, clean up anything found, and only then
--   alter table crm_invoices validate constraint crm_invoices_total_cents_nonneg;
do $do$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_invoices_total_cents_nonneg'
      and conrelid = 'public.crm_invoices'::regclass
  ) then
    alter table public.crm_invoices
      add constraint crm_invoices_total_cents_nonneg check (total_cents >= 0) not valid;
  end if;
end
$do$;
