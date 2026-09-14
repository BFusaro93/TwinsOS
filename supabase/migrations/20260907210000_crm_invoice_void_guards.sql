-- F-02: "Void" on an invoice with payments applied silently did nothing.
--
-- Root cause of the silence was client-side (a native window.confirm), but the
-- DB happily allowed the write: crm_invoice_block_locked_financial_update only
-- guards subtotal/discount/tax/total columns, not `status` or `balance_cents`.
-- So an API / Zapier / import path (or the fixed UI, if the client guard were
-- ever bypassed) could void an invoice that already has money applied to it,
-- orphaning those payment allocations — the payment stays recorded against a
-- record that no longer counts toward AR.
--
-- Enforce it server-side:
--   1. Voiding an invoice with amount_paid_cents > 0 is rejected outright.
--      Refund or unapply the payments first.
--
-- `locked` deliberately does NOT block a void. The lock guards the invoice's
-- amounts (crm_invoice_block_locked_financial_update covers only
-- subtotal/discount/tax/total) and is set as soon as an invoice is sent or
-- printed; voiding an issued-but-unpaid invoice is the normal way to cancel
-- one, so gating that behind an unlock would block the most common case.
--
-- Raises P0001 with a user-facing message; the client surfaces it verbatim.

create or replace function crm_invoice_block_void_with_payments()
returns trigger
language plpgsql
as $$
declare
  v_paid integer;
begin
  -- Only interested in a transition *into* void.
  if new.status is distinct from 'void' or old.status = 'void' then
    return new;
  end if;

  v_paid := coalesce(old.amount_paid_cents, 0);
  if v_paid > 0 then
    raise exception
      'This invoice cannot be voided: % in payments are applied to it. Refund or unapply them first.',
      to_char(v_paid / 100.0, 'FM$999,999,990.00')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_invoices_block_void_with_payments on public.crm_invoices;

create trigger trg_crm_invoices_block_void_with_payments
  before update on public.crm_invoices
  for each row
  execute function crm_invoice_block_void_with_payments();

comment on function crm_invoice_block_void_with_payments() is
  'Rejects voiding an invoice that has payments applied (F-02) — it would orphan the payment allocations. A locked invoice is still voidable; the lock guards amounts, not cancellation.';
