-- A won chargeback re-applies the restored money to the payment's invoice, but the allocation
-- insert had no org_id (NOT NULL, default my_org_id() = NULL under the service role), so the
-- RPC rolled back, the webhook 500'd, and Stripe retried for days without the payment ever
-- being restored. Same defect 20261016040000 fixed for crm_apply_credit_to_invoice.
create or replace function public.reinstate_stripe_payment_reversal(
  p_payment_id            uuid,
  p_target_reversed_cents integer
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org        uuid;
  v_client     uuid;
  v_invoice    uuid;
  v_refunded   integer;
  v_unused     integer;
  v_target     integer;
  v_delta      integer;
  v_inv_bal    integer;
  v_inv_status text;
  v_apply      integer;
begin
  select org_id, client_id, invoice_id,
         coalesce(refunded_amount_cents, 0), coalesce(unused_amount_cents, 0)
    into v_org, v_client, v_invoice, v_refunded, v_unused
    from public.crm_payments
    where id = p_payment_id and deleted_at is null
    for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if public._org_mismatch(v_org) then
    raise exception 'Unauthorized';
  end if;

  v_target := greatest(coalesce(p_target_reversed_cents, 0), 0);
  v_delta := v_refunded - v_target;
  if v_delta <= 0 then
    return 0;
  end if;

  update public.crm_payments
  set refunded_amount_cents = v_target,
      unused_amount_cents   = v_unused + v_delta
  where id = p_payment_id;

  if v_invoice is not null then
    select coalesce(balance_cents, 0), status
      into v_inv_bal, v_inv_status
      from public.crm_invoices
      where id = v_invoice and deleted_at is null
      for update;
    if found and v_inv_status not in ('draft', 'void') then
      v_apply := least(v_delta, v_inv_bal);
      if v_apply > 0 then
        -- org_id from the payment row: the column default is my_org_id(), NULL under the
        -- service role this runs as from the Stripe webhook.
        insert into public.crm_payment_allocations (org_id, payment_id, invoice_id, amount_cents)
        values (v_org, p_payment_id, v_invoice, v_apply);
        update public.crm_payments
        set unused_amount_cents = unused_amount_cents - v_apply
        where id = p_payment_id;
        perform public.apply_payment_to_invoice(v_invoice, v_apply);
      end if;
    end if;
  end if;

  perform public.sync_client_balance(v_client);
  return v_delta;
end;
$function$;

revoke execute on function public.reinstate_stripe_payment_reversal(uuid, integer) from public, anon, authenticated;
grant execute on function public.reinstate_stripe_payment_reversal(uuid, integer) to service_role;

comment on function public.reinstate_stripe_payment_reversal(uuid, integer) is
  'Idempotently lowers crm_payments.refunded_amount_cents to Stripe''s reversed total (won chargeback), restoring the money as unapplied credit and re-applying it to the direct invoice link. Service role only.';
