-- refund_payment(): take the refund out of the UNAPPLIED credit first, and
-- only then out of the allocations.
--
-- The previous version reversed p_refund_amount_cents across the allocation
-- rows and never looked at crm_payments.unused_amount_cents. Two ways that
-- lost money, both reproduced against real data:
--
--   1. Refunding a partly-applied prepayment left the credit behind. A $1000
--      payment with $400 applied to an invoice and $600 sitting unused,
--      refunded in full, ended as refunded=100000, unused=60000,
--      allocations=0 — the customer got $1000 back AND kept a $600 credit
--      that could still be spent on the next invoice. Conservation
--      (allocations + unused + refunded = amount) blew out to $1600 on a
--      $1000 payment, which is the invariant the whole payment ledger rests
--      on.
--
--   2. Refunding an overpayment clawed the money back off the invoice
--      instead of the credit. $100 invoice, customer pays $150 (stale
--      balance quote / two intents) -> allocation 100, unused 50, invoice
--      paid. Staff refund the $50 overpayment -> the old code reversed $50
--      off the allocation, reopening a settled invoice with a $50 balance
--      while the client still showed a $50 credit. The reopened invoice went
--      straight back into the autopay / "To Charge" queue.
--
-- Order matters and is the whole fix: unallocated money is the money that was
-- never applied to anything, so it is what a refund should consume first.
--
-- Also tightened while here: each non-last proportional share is now clamped
-- to what is left to place (v_remaining), not just to the allocation's own
-- amount. Independently-rounded shares could previously sum to more than the
-- refund, driving the final share negative, failing the `> 0` guard, and
-- silently under-reversing (5 allocations of 1c, refund 3c -> 4c reversed).
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
  v_unused           integer;
  v_invoice_id       uuid;
  v_new_refunded     integer;
  v_from_unused      integer;
  v_to_allocations   integer;
  v_total_allocated  integer;
  v_remaining        integer;
  v_share            integer;
  v_alloc            record;
  v_idx              integer := 0;
  v_count            integer;
begin
  select org_id, amount_cents, refunded_amount_cents,
         coalesce(unused_amount_cents, 0), invoice_id
    into v_org_id, v_amount_cents, v_old_refunded, v_unused, v_invoice_id
    from public.crm_payments
    where id = p_payment_id
    for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if v_org_id != public.my_org_id() then
    raise exception 'Unauthorized';
  end if;

  if p_refund_amount_cents <= 0 then
    raise exception 'Refund amount must be positive';
  end if;

  v_new_refunded := v_old_refunded + p_refund_amount_cents;

  if v_new_refunded > v_amount_cents then
    raise exception 'Refund amount exceeds remaining refundable balance';
  end if;

  -- Unapplied credit absorbs the refund first; whatever is left comes back
  -- off the invoices.
  v_from_unused    := least(p_refund_amount_cents, v_unused);
  v_to_allocations := p_refund_amount_cents - v_from_unused;

  update public.crm_payments
  set refunded_amount_cents = v_new_refunded,
      unused_amount_cents   = v_unused - v_from_unused
  where id = p_payment_id;

  if v_to_allocations > 0 then
    select coalesce(sum(amount_cents), 0), count(*)
      into v_total_allocated, v_count
      from public.crm_payment_allocations
      where payment_id = p_payment_id;

    if v_count > 0 then
      v_remaining := v_to_allocations;

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
          v_share := round((v_to_allocations::numeric * v_alloc.amount_cents) / v_total_allocated);
        end if;

        -- Never place more than this allocation holds, and never more than is
        -- still owed back.
        v_share := least(v_share, v_alloc.amount_cents, v_remaining);

        if v_share > 0 then
          v_remaining := v_remaining - v_share;

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
      -- Payment applied through the direct crm_payments.invoice_id link
      -- rather than an allocation row.
      perform public.apply_payment_to_invoice(v_invoice_id, -v_to_allocations);
    end if;
  end if;

  return query select v_new_refunded;
end;
$function$;
