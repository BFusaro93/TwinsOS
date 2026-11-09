-- Voiding (or soft-deleting) a LOCKED invoice that carries a visit-tagged line
-- failed with "This invoice is locked and cannot be edited".
--
-- free_visit_tags_on_dead_invoice() (AFTER UPDATE OF status, deleted_at on
-- crm_invoices, 20261022000100) releases the visit_id idempotency tag so the
-- visit can be billed again — but crm_invoice_line_items_block_when_locked()
-- rejects every line UPDATE on a locked invoice, so the whole void rolled back.
-- Sent and printed invoices are exactly the ones that get locked, and exactly
-- the ones a user voids.
--
-- Fix: the tag-release trigger sets a transaction-local flag around its own
-- update, and the lock trigger lets through ONLY an update made under that flag
-- that changes nothing but visit_id -> NULL (updated_at is stamped by
-- trg_crm_invoice_items_updated_at, which runs first). Every other lock rule
-- (inserts, deletes, any other column, a non-null visit_id) is unchanged.
-- Both function bodies below are the live TEST definitions plus that one
-- addition.

create or replace function public.free_visit_tags_on_dead_invoice()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if (new.status = 'void' and old.status is distinct from 'void')
     or (new.deleted_at is not null and old.deleted_at is null) then
    -- Transaction-local, and cleared again right after: the lock trigger only
    -- honours it for a visit_id -> null change (see below).
    perform set_config('app.freeing_visit_tags', 'on', true);
    update public.crm_invoice_line_items
       set visit_id = null
     where invoice_id = new.id
       and visit_id is not null;
    perform set_config('app.freeing_visit_tags', '', true);
  end if;
  return new;
end;
$function$;

create or replace function public.crm_invoice_line_items_block_when_locked()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
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
  -- Voiding / soft-deleting a locked invoice releases its visit tags
  -- (free_visit_tags_on_dead_invoice). That one change — visit_id to NULL and
  -- nothing else — is allowed through while that trigger's flag is set.
  if coalesce(current_setting('app.freeing_visit_tags', true), '') = 'on'
     and new.visit_id is null
     and old.visit_id is not null
     and (to_jsonb(new) - 'visit_id' - 'updated_at') = (to_jsonb(old) - 'visit_id' - 'updated_at') then
    return new;
  end if;

  select locked into v_old_locked from public.crm_invoices where id = old.invoice_id;
  select locked into v_new_locked from public.crm_invoices where id = new.invoice_id;
  if coalesce(v_old_locked, false) or coalesce(v_new_locked, false) then
    raise exception 'This invoice is locked and cannot be edited. Unlock it first.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$function$;
