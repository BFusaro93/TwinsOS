-- Account balance excludes draft invoices.
--
-- clients.balance_outstanding_cents previously summed balance_cents of every
-- non-void invoice, drafts included. Drafts are already reported separately as
-- balance_uninvoiced_cents (the "pending invoices" line on the client screen),
-- so the two overlapped and every AR figure built on the outstanding balance
-- was overstated by unissued work. Same rule as the report views
-- (rpt_invoices.is_issued): issued = status NOT IN ('draft','void').
--
-- Function body is the live PROD definition (pg_get_functiondef, 2026-09-06)
-- with only the balance_outstanding_cents predicate changed, followed by a
-- one-time recompute of that single column for every client.
CREATE OR REPLACE FUNCTION public.sync_client_balance(p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  update clients
  set
    balance_outstanding_cents = coalesce(
      (select sum(balance_cents)
       from crm_invoices
       where client_id = p_client_id
         and deleted_at is null
         and status not in ('void', 'draft')),
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
$function$;

-- Recompute the outstanding balance for every client under the new rule.
update clients c
set balance_outstanding_cents = coalesce(
  (select sum(i.balance_cents)
     from crm_invoices i
    where i.client_id = c.id
      and i.deleted_at is null
      and i.status not in ('void', 'draft')),
  0)
where c.deleted_at is null;
