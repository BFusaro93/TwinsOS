-- applyPaymentToInvoice() (src/lib/hooks/use-invoices.ts) is the shared helper
-- behind every payment recording, allocation edit, and refund — it read
-- total_cents/amount_paid_cents/status, computed the new balance/status in
-- JS, then wrote it back in a separate UPDATE with no row lock. Two
-- concurrent calls against the same invoice (recording a payment while
-- editing an existing allocation, or two staff members applying payments to
-- the same invoice around the same time) can both read the same stale
-- amount_paid_cents and have the second write clobber the first — silently
-- losing a payment's effect on the invoice's balance/status.
--
-- apply_payment_to_invoice() does the same computation atomically inside a
-- single UPDATE, row-locked by the initial SELECT ... FOR UPDATE, so
-- concurrent callers serialize instead of racing on stale reads.

create or replace function public.apply_payment_to_invoice(
  p_invoice_id  uuid,
  p_delta_cents integer
)
returns table(new_status text, was_newly_paid boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id      uuid;
  v_total_cents integer;
  v_old_paid    integer;
  v_old_status  text;
  v_new_paid    integer;
  v_new_balance integer;
  v_open_status text;
  v_new_status  text;
begin
  select org_id, total_cents, amount_paid_cents, status
    into v_org_id, v_total_cents, v_old_paid, v_old_status
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  v_new_paid := greatest(0, v_old_paid + p_delta_cents);
  v_new_balance := greatest(0, v_total_cents - v_new_paid);
  v_open_status := case when v_old_status = 'printed' then 'printed' else 'sent' end;
  v_new_status := case
    when v_new_balance <= 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    else v_open_status
  end;

  update public.crm_invoices
  set amount_paid_cents = v_new_paid,
      balance_cents = v_new_balance,
      status = v_new_status
  where id = p_invoice_id;

  return query select v_new_status, (v_new_status = 'paid' and v_old_status is distinct from 'paid');
end;
$$;
