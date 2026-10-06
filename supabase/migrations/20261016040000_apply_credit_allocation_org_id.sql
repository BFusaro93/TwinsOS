-- A10: crm_apply_credit_to_invoice inserted crm_payment_allocations without an
-- org_id. The column default is my_org_id(), which is NULL when the RPC runs
-- under the service role — exactly how the public pay-link and portal
-- create-intent routes call it via applyCreditBeforeCharge — so the insert hit
-- NOT NULL and credit-first charging failed for those flows. The org is now
-- taken from the (locked) payment row. Everything else is the definition from
-- 20260913180000 verbatim: SECURITY INVOKER (RLS and the allocation guard
-- triggers still apply for user sessions), same locking order and grants.

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
  v_pay_org      uuid;
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
  select client_id, org_id, coalesce(unused_amount_cents, 0)
    into v_pay_client, v_pay_org, v_pay_unused
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

  -- org_id comes from the payment row, not the column default: the default is
  -- my_org_id(), which is NULL under the service role (public/portal pay-link
  -- create-intent routes call this RPC with a service-role client), so the
  -- insert violated NOT NULL and the credit-first charge flow failed.
  insert into crm_payment_allocations (org_id, payment_id, invoice_id, amount_cents)
  values (v_pay_org, p_payment_id, p_invoice_id, v_apply);

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
