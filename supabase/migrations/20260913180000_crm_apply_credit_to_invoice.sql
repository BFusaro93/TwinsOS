-- Applying unapplied money (a proposal deposit, a prepayment, an overpayment)
-- to an invoice, as ONE transaction.
--
-- useApplyCreditToInvoice did it as four unrelated statements from the
-- browser: insert the allocation, update unused_amount_cents, call
-- apply_payment_to_invoice, sync the client balance. Two defects fell out of
-- that:
--
-- 1. No atomicity. If the apply_payment_to_invoice call failed (network drop,
--    closed tab, the RPC's own Unauthorized raise), the allocation row was
--    already committed and unused_amount_cents already decremented, but the
--    invoice balance never moved. The client's credit vanished and the invoice
--    still showed the full amount owing.
--
-- 2. A lost update. `unused_amount_cents` was written as an absolute value
--    computed from a read taken at the top of the mutation. Two tabs applying
--    a $2,000 deposit to two different invoices each read unused = 200000,
--    each allocated 100000, and each wrote unused = 100000. The allocation
--    guard passed both (it only compares sum(allocations) against
--    amount_cents), leaving allocations 200000 + unused 100000 = 300000
--    against a 200000 payment. sync_client_balance then reported a phantom
--    $1,000 of credit that no allocation could ever consume, because every
--    further insert would breach the guard.
--
-- Doing the whole thing in plpgsql makes it one transaction, and the
-- `for update` on crm_payments serialises concurrent appliers so the second
-- one reads the first one's result instead of a stale snapshot.
--
-- The amount is recomputed here from the locked rows rather than trusted from
-- the caller: least(requested, still-unapplied, still-owing). That is what
-- makes the "apply oldest money first" loop in InvoiceDetail safe to run
-- against numbers its page rendered some time ago.
create or replace function public.crm_apply_credit_to_invoice(
  p_payment_id   uuid,
  p_invoice_id   uuid,
  p_amount_cents integer
)
returns integer
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_pay_client   uuid;
  v_pay_unused   integer;
  v_inv_client   uuid;
  v_inv_balance  integer;
  v_inv_status   text;
  v_apply        integer;
begin
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Nothing to apply';
  end if;

  -- Lock the payment first, always in this order, so two appliers can't
  -- deadlock against each other.
  select client_id, coalesce(unused_amount_cents, 0)
    into v_pay_client, v_pay_unused
  from crm_payments
  where id = p_payment_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  select client_id, coalesce(balance_cents, 0), status
    into v_inv_client, v_inv_balance, v_inv_status
  from crm_invoices
  where id = p_invoice_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_inv_status in ('draft', 'void') then
    raise exception 'Money can only be applied to an issued invoice (this one is %)', v_inv_status
      using errcode = 'check_violation';
  end if;

  -- Deliberately permissive about WHICH client, to match
  -- guard_payment_allocation_client_match: a parent client's payment may settle
  -- a child client's invoice (a property manager paying for one of their
  -- sites). The trigger is the authority; re-implementing the hierarchy check
  -- here would only risk disagreeing with it.
  if v_pay_client is distinct from v_inv_client then
    -- Let the trigger decide. It raises with a clear message when the two
    -- clients are genuinely unrelated.
    null;
  end if;

  v_apply := least(p_amount_cents, v_pay_unused, v_inv_balance);
  if v_apply <= 0 then
    raise exception 'Nothing left to apply';
  end if;

  insert into crm_payment_allocations (payment_id, invoice_id, amount_cents)
  values (p_payment_id, p_invoice_id, v_apply);

  -- Computed from the LOCKED read, so a concurrent applier cannot clobber it.
  update crm_payments
  set unused_amount_cents = v_pay_unused - v_apply
  where id = p_payment_id;

  perform apply_payment_to_invoice(p_invoice_id, v_apply);
  perform sync_client_balance(v_inv_client);

  return v_apply;
end;
$$;

revoke execute on function public.crm_apply_credit_to_invoice(uuid, uuid, integer) from public, anon;
grant  execute on function public.crm_apply_credit_to_invoice(uuid, uuid, integer) to authenticated, service_role;
