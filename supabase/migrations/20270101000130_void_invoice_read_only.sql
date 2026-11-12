-- Void is final (20270101000110) covered the status only: a void invoice's
-- lines, totals, dates, terms, discount and notes could still be edited from
-- Invoice Detail or by a direct API write, changing a document the client may
-- already hold (and, for QuickBooks-linked invoices, one that is void there).
--
-- A direct user write on a void invoice may now only:
--   * delete it (deleted_at), lock / unlock it (locked, locked_at);
-- and its lines may only be removed (Delete Invoice removes the lines, then
-- soft-deletes the invoice) — never added or edited.
--
-- Exempt, like every crm guard: service role (QuickBooks sync, Stripe webhooks,
-- cron), SECURITY DEFINER RPCs (crm_duplicate_void_invoice, merges) and
-- trigger cascades (free_visit_tags_on_dead_invoice clearing visit_id /
-- setting released_visit_id) — _crm_direct_user_write() is false for all of
-- them. The transition INTO void is untouched: OLD.status is not yet 'void'.

create or replace function public.crm_invoice_void_read_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status is distinct from 'void' or not public._crm_direct_user_write() then
    return new;
  end if;

  if public._crm_changed_outside(
       to_jsonb(old), to_jsonb(new),
       array['deleted_at', 'updated_at', 'locked', 'locked_at']) then
    raise exception 'A void invoice can''t be changed. Use Duplicate as draft to bill the work again.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_invoices_void_read_only on public.crm_invoices;
create trigger trg_crm_invoices_void_read_only
  before update on public.crm_invoices
  for each row execute function public.crm_invoice_void_read_only();

create or replace function public.crm_invoice_line_items_void_read_only()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  if not public._crm_direct_user_write() then
    return coalesce(new, old);
  end if;

  if not exists (
    select 1 from public.crm_invoices i
    where i.id in (v_invoice_id, old.invoice_id) and i.status = 'void'
  ) then
    return coalesce(new, old);
  end if;

  -- Delete Invoice removes the lines before soft-deleting the invoice.
  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and new.invoice_id is not distinct from old.invoice_id
     and not public._crm_changed_outside(to_jsonb(old), to_jsonb(new), array['updated_at']) then
    return new;
  end if;

  raise exception 'A void invoice''s lines can''t be changed. Use Duplicate as draft to bill the work again.'
    using errcode = '42501';
end;
$$;

drop trigger if exists trg_crm_invoice_line_items_void_read_only on public.crm_invoice_line_items;
create trigger trg_crm_invoice_line_items_void_read_only
  before insert or update or delete on public.crm_invoice_line_items
  for each row execute function public.crm_invoice_line_items_void_read_only();

revoke all on function public.crm_invoice_void_read_only() from public, anon;
revoke all on function public.crm_invoice_line_items_void_read_only() from public, anon;
