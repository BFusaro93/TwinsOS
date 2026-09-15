-- Server-side enforcement of crm_invoices.locked.
--
-- Bug: locked was only enforced in the UI (disabled={invoice.locked} in
-- InvoiceDetail.tsx). Nothing stopped a stale browser tab, a race between two
-- tabs, or a direct API/RPC call from writing to a locked invoice's financial
-- columns or its line items. src/app/api/crm/invoices/merge/route.ts already
-- checks `locked` before merging — this migration makes the same guarantee
-- hold everywhere, at the DB layer, per the project's "enforced at two
-- layers: RLS in the DB AND middleware checks in Route Handlers" convention.
--
-- Scope: only the computed financial totals are blocked while locked=true
-- (subtotal_cents, discount_cents, discount_type, discount_value,
-- applied_discount_id, tax_rate_bps, tax_cents, total_cents) — these are what
-- "locked" is meant to freeze (an already-printed/sent invoice's numbers).
-- amount_paid_cents/balance_cents are intentionally NOT blocked: recording a
-- payment against a locked (finalized/sent) invoice is normal and must keep
-- working. Toggling `locked` itself (locked true -> false) is always allowed
-- — that's the unlock operation.

create or replace function public.crm_invoice_block_locked_financial_update()
returns trigger
language plpgsql
as $$
begin
  -- Only guard when the row was already locked and this update does not
  -- unlock it. Unlocking (NEW.locked = false) is always allowed even if
  -- bundled with other field changes, since that's the sanctioned way out.
  if old.locked is true and coalesce(new.locked, true) is true then
    if new.subtotal_cents is distinct from old.subtotal_cents
      or new.discount_cents is distinct from old.discount_cents
      or new.discount_type is distinct from old.discount_type
      or new.discount_value is distinct from old.discount_value
      or new.applied_discount_id is distinct from old.applied_discount_id
      or new.tax_rate_bps is distinct from old.tax_rate_bps
      or new.tax_cents is distinct from old.tax_cents
      or new.total_cents is distinct from old.total_cents
    then
      raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_crm_invoices_block_locked_financial_update on public.crm_invoices;
create trigger trg_crm_invoices_block_locked_financial_update
  before update on public.crm_invoices
  for each row
  execute function public.crm_invoice_block_locked_financial_update();

-- Line items: block insert/update/delete outright while the parent invoice
-- is locked. An UPDATE that moves a line item onto or off of a locked
-- invoice (via invoice_id) is blocked too, checking both the old and new
-- parent.
create or replace function public.crm_invoice_line_items_block_when_locked()
returns trigger
language plpgsql
as $$
declare
  v_old_locked boolean;
  v_new_locked boolean;
begin
  if tg_op = 'DELETE' then
    select locked into v_old_locked from public.crm_invoices where id = old.invoice_id;
    if coalesce(v_old_locked, false) then
      raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    select locked into v_new_locked from public.crm_invoices where id = new.invoice_id;
    if coalesce(v_new_locked, false) then
      raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
        using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  select locked into v_old_locked from public.crm_invoices where id = old.invoice_id;
  select locked into v_new_locked from public.crm_invoices where id = new.invoice_id;
  if coalesce(v_old_locked, false) or coalesce(v_new_locked, false) then
    raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_invoice_line_items_block_when_locked on public.crm_invoice_line_items;
create trigger trg_crm_invoice_line_items_block_when_locked
  before insert or update or delete on public.crm_invoice_line_items
  for each row
  execute function public.crm_invoice_line_items_block_when_locked();
