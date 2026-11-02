-- crm_invoices / crm_invoice_line_items writes now require
-- acct_add_modify_invoices (the "Add/Modify Invoices" key) when they come
-- straight from an end-user session. See 20261207000100 for what counts as one
-- (service role, cron, webhooks, SECURITY DEFINER RPCs and trigger cascades
-- are exempt; admins pass has_settings_permission).
--
-- Without the key a user may still:
--  * generate invoices with the key that offers it — contract_create_invoices
--    (Contracts > Generate Invoices) or snow_invoicing_generate (Snow
--    Invoicing). Those flows insert a draft, add its lines, then write its
--    totals or discard it, so the key allows exactly that: inserting a draft,
--    and writing a draft (and its lines) that the same user created.
--    created_by is stamped on insert for this.
--  * print / email / QuickBooks-sync an invoice they can see. Those touch only
--    locked (locking — never unlocking, which re-opens editing), locked_at,
--    status draft -> printed/sent and printed -> sent, pdf_template_id and the
--    qbo_* sync columns. The email route's draft totals recompute runs as the
--    service role (src/app/api/crm/invoices/email/route.ts).
--
-- Visit-completion auto-invoicing (src/lib/visits/complete-visit.ts) now runs
-- its side effects as the service role, like the crew clock-out routes, so a
-- Scheduler completing a visit on the dispatch board still auto-invoices it.
--
-- The trigger is named a_* so it fires before the other BEFORE triggers on the
-- table (same-timing triggers fire in name order) and sees only the user's
-- own change, not columns those triggers derive.
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

    -- Print / email / QuickBooks bookkeeping.
    if not public._crm_changed_outside(to_jsonb(old), to_jsonb(new),
         array['locked', 'locked_at', 'status', 'pdf_template_id', 'qbo_*'])
       and (new.locked or not old.locked)
       and (new.status = old.status
            or (old.status = 'draft' and new.status in ('printed', 'sent'))
            or (old.status = 'printed' and new.status = 'sent')) then
      return new;
    end if;

    raise exception 'You do not have permission to modify invoices'
      using errcode = '42501';
  end if;

  raise exception 'You do not have permission to delete invoices'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_invoices_enforce_write_permission on public.crm_invoices;
create trigger a_crm_invoices_enforce_write_permission
  before insert or update or delete on public.crm_invoices
  for each row
  execute function public.enforce_crm_invoice_write_permission();

-- Lines follow their invoice: the key, or a generator writing lines on its
-- own draft.
create or replace function public.enforce_crm_invoice_line_write_permission()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_ids uuid[];
begin
  if not public._crm_direct_user_write()
     or public.has_settings_permission('acct_add_modify_invoices') then
    return coalesce(new, old);
  end if;

  v_invoice_ids := case tg_op
    when 'INSERT' then array[new.invoice_id]
    when 'DELETE' then array[old.invoice_id]
    else array[new.invoice_id, old.invoice_id]
  end;

  if public._crm_has_any_permission(
       array['contract_create_invoices', 'snow_invoicing_generate'])
     and not exists (
       select 1 from unnest(v_invoice_ids) touched(id)
       where not exists (
         select 1 from public.crm_invoices i
         where i.id = touched.id
           and i.status = 'draft'
           and i.created_by = auth.uid()
           and i.deleted_at is null
       )
     ) then
    return coalesce(new, old);
  end if;

  raise exception 'You do not have permission to modify invoice line items'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_crm_invoice_line_items_enforce_write_permission on public.crm_invoice_line_items;
create trigger a_crm_invoice_line_items_enforce_write_permission
  before insert or update or delete on public.crm_invoice_line_items
  for each row
  execute function public.enforce_crm_invoice_line_write_permission();
