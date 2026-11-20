-- Follow-up to 20270119000100: the money-column guard on crm_payments only lets a direct user
-- UPDATE touch an allowlist of descriptive columns, so saving a custom payment method's name
-- (method_label) was rejected with 42501 and a custom-method payment was left as a bare "Other".
-- method_label is descriptive (like method), so add it to the allowlist. Body is otherwise the live
-- definition, unchanged. Re-check the PROD definition (pg_get_functiondef) matches before applying.

CREATE OR REPLACE FUNCTION public.guard_crm_payment_money_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if not public._crm_direct_user_write() or public._crm_money_rpc_active() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Only a plain, unapplied manual payment (the payments import); everything
    -- else goes through crm_record_payment or the Stripe webhook.
    if coalesce(new.refunded_amount_cents, 0) <> 0
       or coalesce(new.processing_fee_cents, 0) <> 0
       or new.unused_amount_cents is distinct from new.amount_cents
       or new.invoice_id is not null
       or new.estimate_id is not null
       or new.deleted_at is not null
       or new.stripe_payment_intent_id is not null
       or new.stripe_dispute_id is not null
       or new.dispute_status is not null
       or new.disputed_at is not null
       or new.dispute_allocation_snapshot is not null then
      raise exception 'Payments are recorded through Record Payment — this payment can''t be created directly'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE: only the descriptive fields (and the invoice link / soft delete below).
  if public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
       array['payment_date', 'method', 'method_label', 'reference', 'memo', 'notes', 'invoice_id', 'deleted_at']) then
    raise exception 'A payment''s amounts, refunds and online-payment details can only change through Edit Payment or Refund'
      using errcode = '42501';
  end if;

  -- The invoice link may only point at an invoice the payment is actually
  -- allocated to (or be cleared): a bare link is read as "applied there" by
  -- the legacy path in crm_update_payment.
  if new.invoice_id is distinct from old.invoice_id
     and new.invoice_id is not null
     and not exists (
       select 1 from public.crm_payment_allocations a
        where a.payment_id = new.id and a.invoice_id = new.invoice_id
     ) then
    raise exception 'A payment can only be linked to an invoice it is applied to'
      using errcode = '42501';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if old.deleted_at is not null then
      raise exception 'A deleted payment can''t be restored'
        using errcode = '42501';
    end if;
    if not public._crm_has_any_permission(array['acct_delete_card_payments', 'acct_delete_ach_payments']) then
      raise exception 'You do not have permission to delete payments'
        using errcode = '42501';
    end if;
    if old.stripe_payment_intent_id is not null
       or coalesce(old.refunded_amount_cents, 0) <> 0
       or coalesce(old.unused_amount_cents, 0) <> coalesce(old.amount_cents, 0)
       or new.invoice_id is not null
       or exists (select 1 from public.crm_payment_allocations a where a.payment_id = old.id) then
      raise exception 'Only an unapplied manual payment can be deleted — edit it or issue a refund instead'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;
