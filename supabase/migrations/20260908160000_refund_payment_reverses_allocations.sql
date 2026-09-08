-- A partial refund left the payment's allocations at their pre-refund amount.
--
-- The refund route did three separate, non-atomic things: bump
-- crm_payments.refunded_amount_cents (this RPC), reverse each invoice's
-- amount_paid/balance (apply_payment_to_invoice, in a TypeScript loop), and
-- nothing at all to crm_payment_allocations. So after refunding $100 of a $525
-- card payment, the invoice correctly reopened with a $100 balance while its
-- allocation row still claimed the full $525 was applied to it.
--
-- That broke the invariant sum(allocations) = invoice.amount_paid_cents, with
-- three consequences:
--
--   1. Any later payment on that invoice was rejected by the allocation-limit
--      guard (20260906160200) — but only AFTER the card had been charged at
--      Stripe, since the allocation insert is the last step of recording. The
--      customer was debited and no payment was applied. Reproduced live on
--      2026-09-08: a $100 autopay charge on Brandon Fusaro's reopened invoice
--      came back `succeeded` with "Allocation exceeds invoice total: 52500
--      already applied + 10000 requested > 52500 invoice total".
--   2. Every report keyed on crm_payment_allocations overstated what had been
--      applied to the invoice, by the refunded amount, indefinitely.
--   3. A crash between the three steps left its own mismatch.
--
-- The whole reversal now happens inside this one function, so it is atomic and
-- there is no ordering to get wrong. The proportional split across a payment
-- spread over several invoices keeps the route's previous behaviour: shares are
-- rounded, and the last allocation absorbs the remainder so the parts always
-- sum to exactly the refunded amount.
--
-- Allocations are DELETED rather than zeroed when fully refunded —
-- crm_payment_allocations has a CHECK (amount_cents > 0).

create or replace function public.refund_payment(
  p_payment_id uuid,
  p_refund_amount_cents integer
)
returns table(new_refunded_amount_cents integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org_id           uuid;
  v_amount_cents     integer;
  v_old_refunded     integer;
  v_new_refunded     integer;
  v_invoice_id       uuid;
  v_total_allocated  integer;
  v_remaining        integer;
  v_share            integer;
  v_alloc            record;
  v_idx              integer := 0;
  v_count            integer;
begin
  select org_id, amount_cents, refunded_amount_cents, invoice_id
    into v_org_id, v_amount_cents, v_old_refunded, v_invoice_id
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

  -- Reverse the refund across every invoice this payment was actually
  -- allocated to. A payment split over several invoices has no single
  -- invoice_id, so the allocation rows are the source of truth.
  select coalesce(sum(amount_cents), 0), count(*)
    into v_total_allocated, v_count
    from public.crm_payment_allocations
    where payment_id = p_payment_id;

  if v_count > 0 then
    v_remaining := p_refund_amount_cents;

    -- Ordered so the "last one absorbs the remainder" rule is deterministic
    -- rather than following physical row order.
    for v_alloc in
      select id, invoice_id, amount_cents
        from public.crm_payment_allocations
        where payment_id = p_payment_id
        order by created_at, id
        for update
    loop
      v_idx := v_idx + 1;

      if v_idx = v_count then
        v_share := v_remaining;
      else
        v_share := round((p_refund_amount_cents::numeric * v_alloc.amount_cents) / v_total_allocated);
      end if;

      -- Never claw back more than this allocation actually holds; anything
      -- left over rolls into the following allocations.
      v_share := least(v_share, v_alloc.amount_cents);
      v_remaining := v_remaining - v_share;

      if v_share > 0 then
        if v_share >= v_alloc.amount_cents then
          delete from public.crm_payment_allocations where id = v_alloc.id;
        else
          update public.crm_payment_allocations
          set amount_cents = amount_cents - v_share
          where id = v_alloc.id;
        end if;

        perform public.apply_payment_to_invoice(v_alloc.invoice_id, -v_share);
      end if;
    end loop;
  elsif v_invoice_id is not null then
    -- Legacy payment recorded before allocations existed.
    perform public.apply_payment_to_invoice(v_invoice_id, -p_refund_amount_cents);
  end if;

  return query select v_new_refunded;
end;
$function$;

notify pgrst, 'reload schema';
