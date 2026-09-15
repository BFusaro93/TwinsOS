-- D-18 / D-22: money-integrity guard on crm_payment_allocations.
--
-- Live billing found two holes the app layer alone didn't close:
--   * D-18: "Enter Payment" on a $55 invoice with Amount $80 allocated the full
--     $80 to the invoice. apply_payment_to_invoice() clamps the balance at 0,
--     so the invoice showed "Paid -$80.00" and the $25 overpayment vanished —
--     unused_amount_cents was 0, so it never surfaced as client credit.
--   * D-22: Edit Payment let a DRAFT invoice be allocated to. Drafts are
--     "uninvoiced work" (see report_views_issued_invoice_and_cash_rules) and
--     must not carry payments until they're issued.
--
-- The UI now caps allocations at the invoice balance and hides drafts
-- (src/components/crm/invoices/InvoiceDetail.tsx RecordPaymentDialog,
-- src/components/crm/payments/PaymentsList.tsx AddPaymentDialog) and the
-- record/update hooks clamp + validate server-side (use-invoices.ts). This
-- trigger is the second layer, same pattern as
-- guard_payment_allocation_client_match() in
-- 20260905110000_guard_payment_allocation_client_match.sql:
--
--   1. an allocation may only target an ISSUED invoice (status not draft/void)
--   2. sum of allocations on an invoice  <= that invoice's total_cents
--   3. sum of allocations on a payment   <= that payment's amount_cents
--
-- Scope: checked on INSERT, and on UPDATE only when the money or the target
-- actually changes (amount_cents / payment_id / invoice_id). The invoice
-- merge route (src/app/api/crm/invoices/merge/route.ts) re-points child
-- invoices' allocations at the parent BEFORE it writes the parent's combined
-- totals — so an invoice_id-only UPDATE deliberately skips checks 1 and 2
-- (the merge target can legitimately be a draft and its total isn't final
-- yet); check 3 is unaffected by that route and still runs.
--
-- Refunds don't touch allocation rows (refund_payment_rpc tracks
-- refunded_amount_cents on the payment), so they're unaffected.
--
-- NOTE: apply to BOTH the prod and test Supabase projects.

create or replace function public.guard_payment_allocation_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_status    text;
  v_invoice_total     integer;
  v_invoice_allocated integer;
  v_payment_amount    integer;
  v_payment_allocated integer;
  v_check_invoice     boolean := true;
  v_check_payment     boolean := true;
begin
  if tg_op = 'UPDATE' then
    -- Nothing money-related changed — let it through untouched.
    if new.amount_cents = old.amount_cents
       and new.invoice_id = old.invoice_id
       and new.payment_id = old.payment_id then
      return new;
    end if;
    -- Re-pointing at another invoice with the same amount (invoice merge):
    -- skip the per-invoice checks, see header comment.
    if new.amount_cents = old.amount_cents
       and new.payment_id = old.payment_id
       and new.invoice_id <> old.invoice_id then
      v_check_invoice := false;
    end if;
    if new.amount_cents = old.amount_cents
       and new.payment_id = old.payment_id then
      v_check_payment := false;
    end if;
  end if;

  if v_check_invoice then
    select status, coalesce(total_cents, 0)
      into v_invoice_status, v_invoice_total
      from public.crm_invoices
      where id = new.invoice_id;

    if v_invoice_status is null then
      raise exception 'invoice_id must reference an existing invoice';
    end if;

    if v_invoice_status in ('draft', 'void') then
      raise exception 'Payments can only be applied to issued invoices (this invoice is %)', v_invoice_status
        using errcode = 'check_violation';
    end if;

    select coalesce(sum(amount_cents), 0)
      into v_invoice_allocated
      from public.crm_payment_allocations
      where invoice_id = new.invoice_id
        and id <> new.id;

    if v_invoice_allocated + new.amount_cents > v_invoice_total then
      raise exception 'Allocation exceeds invoice total: % already applied + % requested > % invoice total (cents)',
        v_invoice_allocated, new.amount_cents, v_invoice_total
        using errcode = 'check_violation';
    end if;
  end if;

  if v_check_payment then
    select coalesce(amount_cents, 0)
      into v_payment_amount
      from public.crm_payments
      where id = new.payment_id;

    if v_payment_amount is null then
      raise exception 'payment_id must reference an existing payment';
    end if;

    select coalesce(sum(amount_cents), 0)
      into v_payment_allocated
      from public.crm_payment_allocations
      where payment_id = new.payment_id
        and id <> new.id;

    if v_payment_allocated + new.amount_cents > v_payment_amount then
      raise exception 'Allocation exceeds payment amount: % already allocated + % requested > % payment (cents)',
        v_payment_allocated, new.amount_cents, v_payment_amount
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_payment_allocation_limits on public.crm_payment_allocations;
create trigger trg_guard_payment_allocation_limits
  before insert or update on public.crm_payment_allocations
  for each row execute function public.guard_payment_allocation_limits();
