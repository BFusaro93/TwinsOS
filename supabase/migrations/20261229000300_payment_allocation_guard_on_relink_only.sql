-- The payment ↔ invoice client-match guard (20260905110000) fired BEFORE
-- INSERT OR UPDATE of ANY column. Once a sub-account was unlinked from (or
-- moved to another) parent, every later write to an existing allocation of the
-- parent's payment on the child's invoice raised — refund_payment (amount_cents),
-- crm_reconcile_invoice_payments, invoice merge/consolidate, and the QuickBooks
-- push storing qbo_payment_id / qbo_sync_error all failed.
--
-- The rule is about which payment is applied to which invoice, so it only needs
-- checking when that pairing is created or changed: on INSERT and on an UPDATE
-- of payment_id / invoice_id. The function itself is unchanged.

drop trigger if exists trg_guard_payment_allocation_client_match on public.crm_payment_allocations;
create trigger trg_guard_payment_allocation_client_match
  before insert or update of payment_id, invoice_id on public.crm_payment_allocations
  for each row execute function public.guard_payment_allocation_client_match();
