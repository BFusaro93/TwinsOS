-- Wire up clients.balance_prepay_cents (previously declared but never written to,
-- per 20260617000001_crm_clients.sql's "AR snapshot" columns).
--
-- Deliberately NOT sourced from crm_payments.unused_amount_cents: that column
-- (added in 20260618000005_crm_payments_v2.sql) has never been written to by any
-- app code path either, so it is always 0 and cannot be trusted. Instead this
-- computes the true unapplied amount live from crm_payments + crm_payment_allocations,
-- the tables application code actually keeps correct (see useRecordPayment /
-- useUpdatePayment in src/lib/hooks/use-invoices.ts).
--
-- Legacy payments recorded before crm_payment_allocations existed only ever set
-- invoice_id directly with no allocation rows — treated as fully applied (0
-- unused) when invoice_id is set and no allocation rows exist, matching the
-- fallback already documented in useUpdatePayment's comments.
create or replace function public.sync_client_balance(p_client_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update clients
  set
    balance_outstanding_cents = coalesce(
      (select sum(balance_cents)
       from crm_invoices
       where client_id = p_client_id
         and deleted_at is null
         and status != 'void'),
      0
    ),
    balance_prepay_cents = coalesce(
      (
        select sum(
          greatest(0,
            p.amount_cents - p.refunded_amount_cents -
            coalesce(alloc.total_cents, case when p.invoice_id is not null then p.amount_cents else 0 end)
          )
        )
        from crm_payments p
        left join (
          select payment_id, sum(amount_cents) as total_cents
          from crm_payment_allocations
          group by payment_id
        ) alloc on alloc.payment_id = p.id
        where p.client_id = p_client_id
          and p.is_prepayment = true
          and p.deleted_at is null
      ),
      0
    )
  where id = p_client_id;
end;
$$;

-- Recompute reactively on payment/allocation changes too, not just invoices —
-- otherwise recording or editing a prepayment wouldn't update the client's
-- Prepayments figure until something unrelated happened to touch an invoice.
create or replace function trg_sync_client_balance_on_payment_change()
returns trigger language plpgsql security definer as $$
begin
  if (tg_op = 'DELETE') then
    perform sync_client_balance(old.client_id);
    return old;
  end if;
  perform sync_client_balance(new.client_id);
  if (tg_op = 'UPDATE' and old.client_id is distinct from new.client_id) then
    perform sync_client_balance(old.client_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_payments_sync_balance on crm_payments;
create trigger trg_crm_payments_sync_balance
  after insert or update or delete on crm_payments
  for each row execute function trg_sync_client_balance_on_payment_change();

create or replace function trg_sync_client_balance_on_allocation_change()
returns trigger language plpgsql security definer as $$
declare
  v_client_id uuid;
begin
  if (tg_op = 'DELETE') then
    select client_id into v_client_id from crm_payments where id = old.payment_id;
  else
    select client_id into v_client_id from crm_payments where id = new.payment_id;
  end if;
  if v_client_id is not null then
    perform sync_client_balance(v_client_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_crm_payment_allocations_sync_balance on crm_payment_allocations;
create trigger trg_crm_payment_allocations_sync_balance
  after insert or update or delete on crm_payment_allocations
  for each row execute function trg_sync_client_balance_on_allocation_change();

-- Backfill every client with an is_prepayment payment now that this is wired up.
do $$
declare
  c record;
begin
  for c in select distinct client_id from crm_payments where is_prepayment = true and deleted_at is null loop
    perform sync_client_balance(c.client_id);
  end loop;
end;
$$;
