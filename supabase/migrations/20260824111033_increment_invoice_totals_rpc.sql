-- Visit completion (src/app/api/crm/visits/[visitId]/complete/route.ts) folds a
-- newly-completed visit into an existing open draft invoice for the client's
-- billing period by reading subtotal_cents/total_cents/balance_cents, then
-- writing back existing + this visit's subtotal in a separate UPDATE. Two
-- visits for the same client completing concurrently (two crews finishing
-- same-day jobs around the same time) can both read the same stale totals —
-- the second write clobbers the first, silently undercounting the invoice
-- even though both visits' line items were inserted.
--
-- increment_invoice_totals() does the read-and-add atomically inside a single
-- UPDATE statement, row-locked by the UPDATE itself, so concurrent callers
-- serialize instead of racing on stale reads.

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
  v_org_id uuid;
begin
  if p_delta_cents = 0 then
    return;
  end if;

  select org_id into v_org_id
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  update public.crm_invoices
  set subtotal_cents = subtotal_cents + p_delta_cents,
      total_cents    = total_cents + p_delta_cents,
      balance_cents  = balance_cents + p_delta_cents,
      updated_at     = now()
  where id = p_invoice_id;
end;
$$;
