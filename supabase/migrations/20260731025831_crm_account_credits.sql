-- Account credits: reuse the existing crm_payments + crm_payment_allocations
-- machinery (record/edit/allocate/refund, reporting) instead of a parallel
-- ledger table. A credit is structurally identical to a prepayment — an
-- unapplied balance that can later be allocated to invoices — just not tied
-- to a real payment method, so is_credit sits alongside is_prepayment as a
-- second, mutually-exclusive-in-practice flag on the same row.
alter table crm_payments
  add column if not exists is_credit boolean not null default false;

comment on column crm_payments.is_credit is
  'Account credit issued to the client (e.g. goodwill adjustment, billing correction) rather than a real payment received. Same allocation/unused-balance mechanics as is_prepayment.';

-- crm_payments.method is constrained to a fixed enum (mirrored in
-- src/components/crm/payments/PaymentsList.tsx's PAYMENT_METHODS); a credit
-- isn't received via any of those, so add a dedicated value rather than
-- mis-tagging it as e.g. "Other". Superset of the live constraint, not a
-- guess from the migration history (see project convention on CHECK drift).
alter table crm_payments drop constraint if exists crm_payments_method_check;
alter table crm_payments add constraint crm_payments_method_check check (
  method = ANY (ARRAY[
    'ACH/E-Check', 'AR Write-off', 'AutoPay', 'Cash', 'Check',
    'Credit Card- AmEx', 'Credit Card- Discover', 'Credit Card- MasterCard',
    'Credit Card- Visa', 'Other', 'Account Credit'
  ])
);

-- Wire up clients.balance_credits_cents (previously declared but never written
-- to, per 20260617000001_crm_clients.sql's "AR snapshot" columns) using the
-- same live-aggregate approach as balance_prepay_cents (20260730000002).
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

-- The existing trg_crm_payments_sync_balance / trg_crm_payment_allocations_sync_balance
-- triggers (20260730000002) already call sync_client_balance() on every payment/
-- allocation change, so no new trigger wiring is needed — they'll pick up credits
-- automatically now that the function itself computes balance_credits_cents.

-- Backfill (no-op today since no is_credit rows exist yet, but safe/cheap to run).
do $$
declare
  c record;
begin
  for c in select distinct client_id from crm_payments where is_credit = true and deleted_at is null loop
    perform sync_client_balance(c.client_id);
  end loop;
end;
$$;
