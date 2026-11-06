-- Lowering an invoice's total no longer orphans its QuickBooks payments.
--
-- crm_reconcile_invoice_payments (restated from the live definition, every
-- guard kept) moves the excess of a now-overpaid invoice back to the paying
-- payments as credit by deleting or shrinking their allocations. The deleted
-- allocation was the only record of its QuickBooks payment id, and a shrunk
-- one still claimed its old amount in QuickBooks — so QuickBooks kept the full
-- payment applied to the (now smaller) invoice. Now:
--   * a deleted allocation's QuickBooks link is queued in crm_qbo_pending_voids
--     (voided by the invoice sync before it updates the QuickBooks invoice, and
--     by the 15-minute cron);
--   * a shrunk allocation that is in QuickBooks is flagged (qbo_sync_error,
--     attempted_at cleared) so the sync reduces the QuickBooks payment.
-- This function is SECURITY DEFINER, so it writes the queue directly.

create or replace function public.crm_reconcile_invoice_payments(p_invoice_id uuid)
 returns table(new_status text, moved_to_credit_cents integer, was_newly_paid boolean)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_inv      record;
  v_alloc    record;
  v_excess   integer;
  v_take     integer;
  v_moved    integer := 0;
  v_new_paid integer;
  v_balance  integer;
  v_status   text;
  v_clients  uuid[] := '{}';
  v_client   uuid;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices','acct_add_modify_payments','acct_add_modify_credits']) then
    raise exception 'You do not have permission to reconcile invoice payments' using errcode = '42501';
  end if;
  select i.id, i.org_id, i.client_id, i.status, i.total_cents, i.amount_paid_cents, i.deleted_at
    into v_inv
    from public.crm_invoices i
    where i.id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_inv.org_id is distinct from public.my_org_id() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  -- Nothing can be applied to these (guard trigger); keep them as they are,
  -- except a draft's balance, which simply tracks its total.
  if v_inv.deleted_at is not null or v_inv.status in ('draft', 'void') then
    if v_inv.status = 'draft' and v_inv.deleted_at is null then
      update public.crm_invoices
        set balance_cents = greatest(0, v_inv.total_cents - v_inv.amount_paid_cents)
        where id = p_invoice_id;
    end if;
    return query select v_inv.status, 0, false;
    return;
  end if;

  v_excess := v_inv.amount_paid_cents - v_inv.total_cents;

  if v_excess > 0 then
    for v_alloc in
      select a.id, a.payment_id, a.amount_cents, a.org_id, a.qbo_payment_id
        from public.crm_payment_allocations a
        where a.invoice_id = p_invoice_id
        order by a.created_at desc, a.id desc
        for update
    loop
      exit when v_excess <= 0;
      v_take := least(v_excess, v_alloc.amount_cents);

      if v_take >= v_alloc.amount_cents then
        -- Its QuickBooks payment must be voided there too; this row is the only record of it.
        if v_alloc.qbo_payment_id is not null then
          insert into public.crm_qbo_pending_voids (org_id, payment_id, qbo_payment_id, created_by)
          values (coalesce(v_alloc.org_id, v_inv.org_id), v_alloc.payment_id, v_alloc.qbo_payment_id, auth.uid())
          on conflict (org_id, qbo_payment_id) do nothing;
        end if;
        delete from public.crm_payment_allocations where id = v_alloc.id;
      else
        update public.crm_payment_allocations
          set amount_cents = amount_cents - v_take,
              qbo_sync_error = case when qbo_payment_id is not null
                                    then 'Changed in Landscapt — waiting to update the QuickBooks payment.'
                                    else qbo_sync_error end,
              qbo_sync_attempted_at = case when qbo_payment_id is not null then null else qbo_sync_attempted_at end
          where id = v_alloc.id;
      end if;

      update public.crm_payments
        set unused_amount_cents = coalesce(unused_amount_cents, 0) + v_take
        where id = v_alloc.payment_id
        returning client_id into v_client;

      -- sync_client_balance() treats a payment with an invoice_id and NO
      -- allocation rows as fully applied; once its last allocation here is
      -- gone, detach it so the moved amount actually shows as credit.
      update public.crm_payments p
        set invoice_id = null
        where p.id = v_alloc.payment_id
          and p.invoice_id = p_invoice_id
          and not exists (select 1 from public.crm_payment_allocations a2 where a2.payment_id = p.id);

      if v_client is not null and not (v_client = any(v_clients)) then
        v_clients := v_clients || v_client;
      end if;

      v_excess := v_excess - v_take;
      v_moved := v_moved + v_take;
    end loop;
  end if;

  v_new_paid := v_inv.amount_paid_cents - v_moved;
  v_balance  := greatest(0, v_inv.total_cents - v_new_paid);
  v_status := case
    when v_new_paid > 0 and v_balance = 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    when v_inv.status in ('paid', 'partial') then 'sent'
    else v_inv.status
  end;

  update public.crm_invoices
    set amount_paid_cents = v_new_paid,
        balance_cents     = v_balance,
        status            = v_status
    where id = p_invoice_id;

  perform public.sync_client_balance(v_inv.client_id);
  foreach v_client in array v_clients loop
    if v_client is distinct from v_inv.client_id then
      perform public.sync_client_balance(v_client);
    end if;
  end loop;

  return query select v_status, v_moved, (v_status = 'paid' and v_inv.status is distinct from 'paid');
end;
$function$;
