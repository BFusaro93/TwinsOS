-- useRefundPayment() (src/lib/hooks/use-invoices.ts) read crm_payments's
-- refunded_amount_cents, added the requested refund in JS, then wrote it
-- back in a separate UPDATE with no row lock — the same TOCTOU pattern
-- already fixed for invoice balances via apply_payment_to_invoice(). Two
-- concurrent refund submissions against the same payment (double-click,
-- two open tabs) both read the same stale refunded_amount_cents and the
-- second write clobbers the first, losing a refund from the record while
-- the invoice-side reversal (applyPaymentToInvoice) still runs for both,
-- double-debiting the client/invoice balance against a payment record that
-- only shows one refund. There was also no server-side cap preventing a
-- refund total exceeding the original payment amount.
--
-- refund_payment() does the read-clamp-write atomically inside a single
-- UPDATE, row-locked by the initial SELECT ... FOR UPDATE, and rejects a
-- request that would push refunded_amount_cents past amount_cents.

create or replace function public.refund_payment(
  p_payment_id uuid,
  p_refund_amount_cents integer
)
returns table(new_refunded_amount_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id           uuid;
  v_amount_cents     integer;
  v_old_refunded     integer;
  v_new_refunded     integer;
begin
  select org_id, amount_cents, refunded_amount_cents
    into v_org_id, v_amount_cents, v_old_refunded
    from public.crm_payments
    where id = p_payment_id
    for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  v_new_refunded := v_old_refunded + p_refund_amount_cents;

  if v_new_refunded > v_amount_cents then
    raise exception 'Refund amount exceeds remaining refundable balance';
  end if;

  update public.crm_payments
  set refunded_amount_cents = v_new_refunded
  where id = p_payment_id;

  return query select v_new_refunded;
end;
$$;

-- NOT VALID: enforce for all future writes without failing this migration
-- over any pre-existing row that already drifted past its payment amount.
alter table public.crm_payments
  add constraint crm_payments_refunded_amount_within_payment
  check (refunded_amount_cents <= amount_cents) not valid;
