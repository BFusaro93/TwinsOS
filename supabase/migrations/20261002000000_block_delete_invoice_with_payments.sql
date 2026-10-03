-- Soft-deleting an invoice that has money applied to it orphans the payment
-- allocations: sync_client_balance still counts the payment as fully applied,
-- so the money is neither credit nor on any live invoice, and it drops out of
-- the statement. Voiding is already blocked in that case
-- (crm_invoice_block_void_with_payments); deleted_at was not. A locked invoice
-- was only protected indirectly (its line-item delete trigger), which unlocking
-- bypassed.
create or replace function public.crm_invoice_block_delete_with_payments()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- Only interested in a transition *into* deleted.
  if new.deleted_at is null or old.deleted_at is not null then
    return new;
  end if;

  if coalesce(old.amount_paid_cents, 0) > 0
     or exists (
       select 1 from crm_payment_allocations a
       where a.invoice_id = old.id and a.amount_cents <> 0
     )
  then
    raise exception
      'This invoice cannot be deleted: payments are applied to it. Refund or unapply them first.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_invoices_block_delete_with_payments on public.crm_invoices;
create trigger trg_crm_invoices_block_delete_with_payments
  before update on public.crm_invoices
  for each row
  execute function public.crm_invoice_block_delete_with_payments();

revoke execute on function public.crm_invoice_block_delete_with_payments() from public, anon, authenticated;

comment on function public.crm_invoice_block_delete_with_payments() is
  'Rejects soft-deleting an invoice that has payments applied — it would orphan the allocations and make the money vanish from the client balance and statement.';
