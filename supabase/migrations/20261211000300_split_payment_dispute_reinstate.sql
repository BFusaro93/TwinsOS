-- A won chargeback on a payment split across several invoices restored the money only as
-- unapplied credit: reinstate_stripe_payment_reversal re-applied it to crm_payments.invoice_id,
-- which is NULL for split payments, so every invoice the withdrawal had reopened stayed open.
--
-- The Connect webhook now records the payment's allocations at funds_withdrawn (before the
-- reversal deletes or shrinks them) in dispute_allocation_snapshot. On a win, the restored
-- amount is spread over those invoices in proportion to their snapshot share, capped at each
-- invoice's live balance; whatever can't be applied stays as unapplied credit.
-- Body = 20261130000900 + the split branch.

alter table public.crm_payments
  add column if not exists dispute_allocation_snapshot jsonb;

comment on column public.crm_payments.dispute_allocation_snapshot is
  'Allocations ([{invoice_id, amount_cents}]) as they stood when a chargeback withdrew the funds; used to re-apply a won dispute. Written by the Stripe webhook only.';

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
  v_snapshot   jsonb;
  v_snap_total bigint;
  v_snap_count integer;
  v_idx        integer := 0;
  v_left       integer;
  v_share      integer;
  v_elem       record;
begin
  select org_id, client_id, invoice_id,
         coalesce(refunded_amount_cents, 0), coalesce(unused_amount_cents, 0),
         dispute_allocation_snapshot
    into v_org, v_client, v_invoice, v_refunded, v_unused, v_snapshot
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
  elsif v_snapshot is not null and jsonb_typeof(v_snapshot) = 'array' then
    -- Split payment: spread the restored amount over the invoices it covered when the funds
    -- were withdrawn, in proportion to those allocations (the last invoice takes the rounding).
    select coalesce(sum((e->>'amount_cents')::integer), 0), count(*)
      into v_snap_total, v_snap_count
      from jsonb_array_elements(v_snapshot) e
      where (e->>'amount_cents')::integer > 0;
    v_left := v_delta;
    if v_snap_total > 0 then
      for v_elem in
        select (e->>'invoice_id')::uuid as invoice_id, (e->>'amount_cents')::integer as amount_cents
          from jsonb_array_elements(v_snapshot) e
          where (e->>'amount_cents')::integer > 0
          order by (e->>'invoice_id')
      loop
        v_idx := v_idx + 1;
        exit when v_left <= 0;
        v_share := case when v_idx = v_snap_count then v_left
                        else round(v_delta::numeric * v_elem.amount_cents / v_snap_total)::integer end;
        v_share := least(v_share, v_left);

        select coalesce(balance_cents, 0), status
          into v_inv_bal, v_inv_status
          from public.crm_invoices
          where id = v_elem.invoice_id and org_id = v_org and deleted_at is null
          for update;
        if found and v_inv_status not in ('draft', 'void') then
          v_apply := least(v_share, v_inv_bal);
          if v_apply > 0 then
            insert into public.crm_payment_allocations (org_id, payment_id, invoice_id, amount_cents)
            values (v_org, p_payment_id, v_elem.invoice_id, v_apply);
            update public.crm_payments
            set unused_amount_cents = unused_amount_cents - v_apply
            where id = p_payment_id;
            perform public.apply_payment_to_invoice(v_elem.invoice_id, v_apply);
            v_left := v_left - v_apply;
          end if;
        end if;
      end loop;
    end if;
  end if;

  perform public.sync_client_balance(v_client);
  return v_delta;
end;
$function$;

revoke execute on function public.reinstate_stripe_payment_reversal(uuid, integer) from public, anon, authenticated;
grant execute on function public.reinstate_stripe_payment_reversal(uuid, integer) to service_role;

comment on function public.reinstate_stripe_payment_reversal(uuid, integer) is
  'Idempotently lowers crm_payments.refunded_amount_cents to Stripe''s reversed total (won chargeback), restoring the money as unapplied credit and re-applying it to the direct invoice link or, for a split payment, across the invoices recorded in dispute_allocation_snapshot. Service role only.';
