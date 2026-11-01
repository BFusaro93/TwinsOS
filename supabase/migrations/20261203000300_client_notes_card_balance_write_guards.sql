-- client_view_notes, client_view_credit_card and client_view_balance gate what
-- the client panel SHOWS; reads cannot be hidden per column (clients is read
-- with select("*") everywhere), but writes can be enforced here:
--
--  * office_notes: changing it requires client_view_notes (you can't edit notes
--    you aren't allowed to see). A save that leaves the value unchanged passes,
--    so the generic edit form still works for everyone with client_allow_edit.
--  * saved payment method columns + stripe_customer_id: written only by the
--    Stripe save/remove routes (service role). A direct user-session write is
--    rejected unless the caller has client_view_credit_card AND
--    acct_add_modify_payments.
--  * autopay_enabled: turning it ON from a user session needs the same pair;
--    turning it OFF is always allowed (client delete does it).
--  * balance_*_cents: derived by sync_client_balance (SECURITY DEFINER, so
--    current_user is the function owner there). A direct write from a
--    user-session role (authenticated/anon) is rejected unless the caller has
--    client_view_balance AND acct_add_modify_credits.
--
-- Exempt: no end-user session (auth.uid() null: service role, cron, webhooks,
-- /api/v1) and admins (has_settings_permission passes profiles.role='admin').
create or replace function public.enforce_client_sensitive_column_permissions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.office_notes is distinct from old.office_notes
     and not public.has_settings_permission('client_view_notes') then
    raise exception 'You do not have permission to change client notes'
      using errcode = '42501';
  end if;

  if (new.saved_payment_method_id, new.saved_payment_method_type,
      new.saved_payment_method_summary, new.stripe_customer_id)
     is distinct from
     (old.saved_payment_method_id, old.saved_payment_method_type,
      old.saved_payment_method_summary, old.stripe_customer_id)
     or (new.autopay_enabled is true and old.autopay_enabled is distinct from true) then
    if not (public.has_settings_permission('client_view_credit_card')
            and public.has_settings_permission('acct_add_modify_payments')) then
      raise exception 'You do not have permission to change stored payment details'
        using errcode = '42501';
    end if;
  end if;

  if current_user in ('authenticated', 'anon')
     and (new.balance_outstanding_cents, new.balance_prepay_cents,
          new.balance_credits_cents)
         is distinct from
         (old.balance_outstanding_cents, old.balance_prepay_cents,
          old.balance_credits_cents) then
    if not (public.has_settings_permission('client_view_balance')
            and public.has_settings_permission('acct_add_modify_credits')) then
      raise exception 'You do not have permission to change client balances'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_clients_enforce_sensitive_columns on public.clients;
create trigger trg_clients_enforce_sensitive_columns
  before update on public.clients
  for each row
  execute function public.enforce_client_sensitive_column_permissions();
