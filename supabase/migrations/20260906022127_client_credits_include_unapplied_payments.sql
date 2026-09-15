-- clients.balance_credits_cents: count every unapplied payment balance, not
-- only is_credit rows.
--
-- 20260731025831_crm_account_credits.sql wired balance_credits_cents to the
-- unused balance of payments flagged is_credit = true. But a regular payment
-- recorded without an invoice (e.g. Ray Choudhury's $237.50 check with
-- unused_amount_cents = 23750 and no allocations) is, per the product docs,
-- "tracked as unused — available later as a credit" — and the client's
-- Accounting card showed Credits $0.00 next to an open invoice for exactly
-- that amount. Credits now = the unused (net of refunds) balance across ALL
-- non-deleted, non-prepayment payments, which naturally includes the
-- explicit account-credit rows. Prepayments stay in balance_prepay_cents so
-- the two lines on the card never double-count.

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
    balance_uninvoiced_cents = coalesce(
      (select sum(total_cents)
       from crm_invoices
       where client_id = p_client_id
         and deleted_at is null
         and status = 'draft'),
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
    ),
    balance_credits_cents = coalesce(
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
          and p.is_prepayment = false
          and p.deleted_at is null
      ),
      0
    )
  where id = p_client_id;
end;
$$;

-- Backfill every client that has a non-prepayment payment on file so the
-- stored snapshot reflects the new definition immediately.
do $$
declare
  c record;
begin
  for c in
    select distinct client_id
    from crm_payments
    where deleted_at is null
      and is_prepayment = false
      and client_id is not null
  loop
    perform sync_client_balance(c.client_id);
  end loop;
end;
$$;
