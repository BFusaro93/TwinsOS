-- Wire up clients.balance_uninvoiced_cents (previously declared but never
-- written to, per 20260617000001_crm_clients.sql's "AR snapshot" columns).
--
-- SA-style "Uninvoiced" concept: a client's draft invoices (weekly/monthly
-- billing accumulates line items into a draft that never shows in the normal
-- invoice list — see src/components/crm/invoices/InvoicesList.tsx's
-- "uninvoiced" quick filter and applyQuickFilter's exclusion of drafts from
-- every other view) represent unbilled work sitting in a holding area until
-- finalized (sent/printed) at period end.
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
          and p.is_credit = true
          and p.deleted_at is null
      ),
      0
    )
  where id = p_client_id;
end;
$$;

-- The existing trg_crm_invoices_sync_balance trigger (20260717000009) already
-- fires on every crm_invoices insert/update/delete, so a draft invoice being
-- created, having line items change its total, or being finalized (status
-- flips out of draft) all already recompute balance_uninvoiced_cents via this
-- same trigger — no new trigger needed.

-- Backfill every client with a draft invoice now that this is wired up.
do $$
declare
  c record;
begin
  for c in select distinct client_id from crm_invoices where status = 'draft' and deleted_at is null loop
    perform sync_client_balance(c.client_id);
  end loop;
end;
$$;
