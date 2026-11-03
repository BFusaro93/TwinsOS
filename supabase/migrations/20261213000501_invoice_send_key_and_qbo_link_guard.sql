-- crm_invoices write guard (20261207000200), two holes closed. Restated from
-- that definition with everything else unchanged.
--
-- 1. Issuing needs the send key. The print / email / QuickBooks bookkeeping
--    carve-out let ANY CRM seat move draft -> sent. Combined with job rates and
--    the auto-invoice route (which writes the draft as the service role), a role
--    with no invoice keys could issue an invoice at any price. Now:
--      draft -> printed      anyone who can see it (Print stays open)
--      draft/printed -> sent acct_send_invoices (Email Invoices)
--    The email route already requires acct_send_invoices before it marks the
--    invoice sent; cron, webhooks and the portal run as the service role.
--
-- 2. qbo_invoice_id is no longer user-writable. The carve-out allowed every
--    qbo_* column, so any seat could point invoice A at invoice B's QuickBooks
--    id and the next sync of A would overwrite (or void) B in QuickBooks; or
--    clear it and the next sync created a duplicate. pushInvoiceToQuickBooks
--    now stores the link as the service role (src/lib/integrations/quickbooks.ts);
--    a user session may still record the sync outcome (qbo_sync_error,
--    qbo_sync_attempted_at).
create or replace function public.enforce_crm_invoice_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_generator boolean;
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;

  if public.has_settings_permission('acct_add_modify_invoices') then
    return coalesce(new, old);
  end if;

  v_generator := public._crm_has_any_permission(
    array['contract_create_invoices', 'snow_invoicing_generate']);

  if tg_op = 'INSERT' then
    if v_generator and new.status = 'draft' and new.created_by = auth.uid() then
      return new;
    end if;
    raise exception 'You do not have permission to create invoices'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- A generator finishing (totals) or discarding its own new draft.
    if v_generator
       and old.status = 'draft' and new.status = 'draft'
       and old.created_by = auth.uid()
       and new.created_by is not distinct from old.created_by then
      return new;
    end if;

    -- Print / email / QuickBooks sync bookkeeping.
    if not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
         array['locked', 'locked_at', 'status', 'pdf_template_id',
               'qbo_sync_error', 'qbo_sync_attempted_at'])
       and (new.locked or not old.locked)
       and (new.status = old.status
            or (old.status = 'draft' and new.status = 'printed')
            or (old.status in ('draft', 'printed') and new.status = 'sent'
                and public.has_settings_permission('acct_send_invoices'))) then
      return new;
    end if;

    if new.status = 'sent' and old.status in ('draft', 'printed')
       and not public.has_settings_permission('acct_send_invoices') then
      raise exception 'You do not have permission to send invoices'
        using errcode = '42501';
    end if;

    raise exception 'You do not have permission to modify invoices'
      using errcode = '42501';
  end if;

  raise exception 'You do not have permission to delete invoices'
    using errcode = '42501';
end;
$$;
