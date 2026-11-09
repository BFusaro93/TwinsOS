-- Accounting-permission enforcement on the payment tables.
--
-- crm_payments / crm_payment_allocations RLS only checks org (+ not crew), so
-- any CRM seat could insert, edit or re-point a payment straight through the
-- REST API, bypassing the acct_* keys that crm_record_payment /
-- crm_update_payment / crm_apply_credit_to_invoice require. Same pattern as
-- the invoice guard (20261207000200 / 20261213000501): a BEFORE trigger that
-- only judges direct user writes (_crm_direct_user_write(): a signed-in
-- session, not the service role, not a nested trigger). SECURITY DEFINER RPCs
-- (refund_payment, reconcile/reinstate, crm_reconcile_invoice_payments,
-- record_stripe_invoice_payment) run as their owner and pass untouched; the
-- SECURITY INVOKER RPCs already demand the same keys before they write, so the
-- keys below are exactly what those RPCs accept:
--
--   crm_payments
--     insert/update of a credit (is_credit)   acct_add_modify_credits
--     insert/update of any other payment      acct_add_modify_payments
--     only unused_amount_cents changes        either key (crm_apply_credit_to_invoice
--                                             accepts either, on either kind)
--     only invoice_id changes                 either key, or acct_add_modify_invoices
--                                             (crm_merge_invoices / crm_consolidate_invoices)
--   crm_payment_allocations
--     only qbo_sync_error / _attempted_at     any CRM seat (QuickBooks sync bookkeeping,
--                                             written by whoever triggered the sync)
--     only invoice_id changes                 either payment key, or acct_add_modify_invoices
--     anything else                           acct_add_modify_payments or acct_add_modify_credits
--
-- qbo_payment_id is the link to a QuickBooks Payment. A seat that could write it
-- could point an allocation at another payment's QuickBooks id and have the next
-- sync update or void THAT payment in QuickBooks (or clear it and get the payment
-- pushed twice). Like crm_invoices.qbo_invoice_id, it is now written only by the
-- service role (src/lib/integrations/quickbooks.ts) — and by crm_update_payment,
-- which carries a link over when it re-inserts the split; it flags that with the
-- transaction-local setting app.payment_qbo_link_rpc, which a REST client can't set.
--
-- Bulk payment import (useBulkImportPayments) inserts the payment row from the
-- browser and updates its invoice_id: both pass for a seat with
-- acct_add_modify_payments, which is also what its crm_apply_credit_to_invoice
-- call needs. A seat without it now gets a per-row "permission" failure instead
-- of an unauthorized payment.

create or replace function public.enforce_crm_payment_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_credit boolean;
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  v_credit := coalesce(new.is_credit, false) or (tg_op = 'UPDATE' and coalesce(old.is_credit, false));

  if public.has_settings_permission(case when v_credit then 'acct_add_modify_credits' else 'acct_add_modify_payments' end) then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- crm_apply_credit_to_invoice spends a payment's unused balance with either key.
    if not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['unused_amount_cents'])
       and public._crm_has_any_permission(array['acct_add_modify_payments', 'acct_add_modify_credits']) then
      return new;
    end if;
    -- Merging / consolidating invoices re-points payments at the new invoice.
    if not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['invoice_id'])
       and public._crm_has_any_permission(array['acct_add_modify_payments', 'acct_add_modify_credits', 'acct_add_modify_invoices']) then
      return new;
    end if;
    raise exception 'You do not have permission to modify payments'
      using errcode = '42501';
  end if;

  raise exception 'You do not have permission to record payments'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_payments_enforce_write_permission on public.crm_payments;
create trigger a_crm_payments_enforce_write_permission
  before insert or update on public.crm_payments
  for each row execute function public.enforce_crm_payment_write_permission();

create or replace function public.enforce_crm_payment_allocation_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_link_rpc boolean := coalesce(current_setting('app.payment_qbo_link_rpc', true), '') = 'on';
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  -- The QuickBooks link: service role only (crm_update_payment's carry-over aside).
  if not v_link_rpc and (
       (tg_op = 'INSERT' and new.qbo_payment_id is not null)
       or (tg_op = 'UPDATE' and new.qbo_payment_id is distinct from old.qbo_payment_id)
     ) then
    raise exception 'The QuickBooks payment link can only be set by the QuickBooks sync'
      using errcode = '42501';
  end if;

  -- Sync bookkeeping: whoever fired the sync records its outcome.
  if tg_op = 'UPDATE'
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['qbo_sync_error', 'qbo_sync_attempted_at']) then
    return new;
  end if;

  if public._crm_has_any_permission(array['acct_add_modify_payments', 'acct_add_modify_credits']) then
    return coalesce(new, old);
  end if;

  if tg_op = 'UPDATE'
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['invoice_id'])
     and public.has_settings_permission('acct_add_modify_invoices') then
    return new;
  end if;

  raise exception 'You do not have permission to change how payments are applied'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_payment_allocations_enforce_write_permission on public.crm_payment_allocations;
create trigger a_crm_payment_allocations_enforce_write_permission
  before insert or update or delete on public.crm_payment_allocations
  for each row execute function public.enforce_crm_payment_allocation_write_permission();
