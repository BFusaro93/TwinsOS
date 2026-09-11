-- guard_payment_allocation_limits(): the invoice-side check was skipped in
-- exactly the case that needs it.
--
-- The condition read:
--
--   if new.amount_cents = old.amount_cents
--      and new.payment_id = old.payment_id
--      and new.invoice_id <> old.invoice_id then
--     v_check_invoice := false;
--
-- i.e. "when the allocation is MOVED to a different invoice, don't validate
-- the invoice". That is backwards. The invoice-side sum is unaffected when the
-- invoice is the SAME (and the amount unchanged); it is precisely a move that
-- lands new money on an invoice that has not been checked.
--
-- Because the draft/void status check lives inside the same branch, a move
-- bypassed both rules. Reproduced against real data: a $395.00 allocation was
-- moved onto an $80.00 invoice in DRAFT status — 4.9x over-allocation onto an
-- invoice that the INSERT path flatly refuses ("Payments can only be applied
-- to issued invoices"). crm_invoices.amount_paid_cents is not resynced by a
-- move either, so the invoice was left reading amount_paid = 0 against
-- sum(allocations) = 39500.
--
-- No application code currently UPDATEs crm_payment_allocations.invoice_id —
-- the app only inserts and deletes — so this is hardening a hole rather than
-- fixing a live path. It is still the trigger's job to hold the invariant for
-- SQL console work, future code, and anything reaching the table through
-- PostgREST.
--
-- payment_id is deliberately dropped from the invoice-side condition: which
-- payment funds an allocation has no bearing on how much that INVOICE has
-- absorbed. The payment-side check below keeps its own (correct) condition.
create or replace function public.guard_payment_allocation_limits()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invoice_status    text;
  v_invoice_total     integer;
  v_invoice_allocated integer;
  v_payment_amount    integer;
  v_payment_allocated integer;
  v_check_invoice     boolean := true;
  v_check_payment     boolean := true;
begin
  if tg_op = 'UPDATE' then
    if new.amount_cents = old.amount_cents
       and new.invoice_id = old.invoice_id
       and new.payment_id = old.payment_id then
      return new;
    end if;

    -- Invoice side is untouched only when the same invoice keeps the same
    -- amount.
    if new.amount_cents = old.amount_cents
       and new.invoice_id = old.invoice_id then
      v_check_invoice := false;
    end if;

    -- Payment side is untouched only when the same payment keeps the same
    -- amount.
    if new.amount_cents = old.amount_cents
       and new.payment_id = old.payment_id then
      v_check_payment := false;
    end if;
  end if;

  if v_check_invoice then
    select status, coalesce(total_cents, 0)
      into v_invoice_status, v_invoice_total
      from public.crm_invoices
      where id = new.invoice_id;

    if v_invoice_status is null then
      raise exception 'invoice_id must reference an existing invoice';
    end if;

    if v_invoice_status in ('draft', 'void') then
      raise exception 'Payments can only be applied to issued invoices (this invoice is %)', v_invoice_status
        using errcode = 'check_violation';
    end if;

    select coalesce(sum(amount_cents), 0)
      into v_invoice_allocated
      from public.crm_payment_allocations
      where invoice_id = new.invoice_id
        and id <> new.id;

    if v_invoice_allocated + new.amount_cents > v_invoice_total then
      raise exception 'Allocation exceeds invoice total: % already applied + % requested > % invoice total (cents)',
        v_invoice_allocated, new.amount_cents, v_invoice_total
        using errcode = 'check_violation';
    end if;
  end if;

  if v_check_payment then
    select coalesce(amount_cents, 0)
      into v_payment_amount
      from public.crm_payments
      where id = new.payment_id;

    if v_payment_amount is null then
      raise exception 'payment_id must reference an existing payment';
    end if;

    select coalesce(sum(amount_cents), 0)
      into v_payment_allocated
      from public.crm_payment_allocations
      where payment_id = new.payment_id
        and id <> new.id;

    if v_payment_allocated + new.amount_cents > v_payment_amount then
      raise exception 'Allocation exceeds payment amount: % already allocated + % requested > % payment (cents)',
        v_payment_allocated, new.amount_cents, v_payment_amount
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$function$;
