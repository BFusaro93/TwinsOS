-- D-12 (part 2): increment_invoice_totals() is what the visit-completion
-- auto-invoice calls when it folds a newly-completed visit into an already-open
-- weekly/monthly draft. It only ever added the visit's subtotal to
-- subtotal/total/balance — tax_cents was never touched, so a taxable invoice
-- that grew visit-by-visit under-billed the tax on every appended visit even
-- once line items carry is_taxable correctly.
--
-- Same signature (callers pass just the subtotal delta); the function now
-- re-derives tax from the invoice's OWN line items after the increment —
-- taxable lines net of their line discounts, less the document-level
-- discount, at the invoice's tax_rate_bps — exactly the formula
-- useUpdateInvoiceFinancials / deleteInvoiceLineItemAndRecalc use in
-- src/lib/hooks/use-invoices.ts, so a manual Save afterwards produces the same
-- numbers. Callers insert the new crm_invoice_line_items rows BEFORE calling
-- this (they already did), so the recompute sees them.
--
-- Still a single row-locked UPDATE per invoice so two visits completing
-- concurrently serialize instead of racing (see the original
-- 20260824111033_increment_invoice_totals_rpc.sql for that history).
--
-- NOTE: apply to BOTH the prod and test Supabase projects.

create or replace function public.increment_invoice_totals(
  p_invoice_id   uuid,
  p_delta_cents  integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id         uuid;
  v_subtotal       integer;
  v_discount       integer;
  v_tax_rate_bps   integer;
  v_amount_paid    integer;
  v_taxable_net    integer;
  v_tax_cents      integer;
  v_total_cents    integer;
begin
  if p_delta_cents = 0 then
    return;
  end if;

  select org_id, subtotal_cents, coalesce(discount_cents, 0), coalesce(tax_rate_bps, 0), coalesce(amount_paid_cents, 0)
    into v_org_id, v_subtotal, v_discount, v_tax_rate_bps, v_amount_paid
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  v_subtotal := v_subtotal + p_delta_cents;

  -- Taxable base: taxable lines net of their own discount, then net of the
  -- document-level discount, never negative.
  select coalesce(sum(li.total_cents - coalesce(li.discount_cents, 0)), 0)
    into v_taxable_net
    from public.crm_invoice_line_items li
    where li.invoice_id = p_invoice_id
      and li.is_taxable = true;

  v_tax_cents := round((greatest(0, v_taxable_net - v_discount)::numeric * v_tax_rate_bps) / 10000)::integer;
  v_total_cents := v_subtotal - v_discount + v_tax_cents;

  update public.crm_invoices
  set subtotal_cents = v_subtotal,
      tax_cents      = v_tax_cents,
      total_cents    = v_total_cents,
      balance_cents  = greatest(0, v_total_cents - v_amount_paid),
      updated_at     = now()
  where id = p_invoice_id;
end;
$$;
