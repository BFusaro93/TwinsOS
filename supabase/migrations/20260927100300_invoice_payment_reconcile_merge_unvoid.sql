-- Invoice-side payment consistency:
--   1. crm_reconcile_invoice_payments(): after an invoice's total changes
--      (line-item edit/delete on an unlocked invoice), bring amount_paid,
--      balance, status and the allocations back in line.
--   2. crm_merge_invoices(): the whole merge in one transaction.
--   3. Leaving 'void' restores balance_cents.

-- ─── 1. reconcile after a total change ──────────────────────────────────────
--
-- The editors (useUpdateInvoiceFinancials / deleteInvoiceLineItemAndRecalc)
-- wrote balance = max(0, total - paid) and nothing else. Dropping a paid
-- invoice's total below what was paid left amount_paid > total, allocations
-- > total (which then made the NEXT allocation on it fail the guard trigger),
-- and the excess money was nowhere as client credit. Raising the total left
-- status 'paid' on an invoice with a balance due.
--
-- Excess: the newest allocations are shrunk/removed first and the amount is
-- put back on each payment's unused_amount_cents (client credit); the invoice
-- stays 'paid'. Legacy payments with no allocation rows can't be shrunk
-- precisely — any excess they account for is left on amount_paid.
create or replace function public.crm_reconcile_invoice_payments(p_invoice_id uuid)
returns table(new_status text, moved_to_credit_cents integer, was_newly_paid boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_inv      record;
  v_alloc    record;
  v_excess   integer;
  v_take     integer;
  v_moved    integer := 0;
  v_new_paid integer;
  v_balance  integer;
  v_status   text;
  v_clients  uuid[] := '{}';
  v_client   uuid;
begin
  select i.id, i.org_id, i.client_id, i.status, i.total_cents, i.amount_paid_cents, i.deleted_at
    into v_inv
    from public.crm_invoices i
    where i.id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_inv.org_id is distinct from public.my_org_id() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  -- Nothing can be applied to these (guard trigger); keep them as they are,
  -- except a draft's balance, which simply tracks its total.
  if v_inv.deleted_at is not null or v_inv.status in ('draft', 'void') then
    if v_inv.status = 'draft' and v_inv.deleted_at is null then
      update public.crm_invoices
        set balance_cents = greatest(0, v_inv.total_cents - v_inv.amount_paid_cents)
        where id = p_invoice_id;
    end if;
    return query select v_inv.status, 0, false;
    return;
  end if;

  v_excess := v_inv.amount_paid_cents - v_inv.total_cents;

  if v_excess > 0 then
    for v_alloc in
      select a.id, a.payment_id, a.amount_cents
        from public.crm_payment_allocations a
        where a.invoice_id = p_invoice_id
        order by a.created_at desc, a.id desc
        for update
    loop
      exit when v_excess <= 0;
      v_take := least(v_excess, v_alloc.amount_cents);

      if v_take >= v_alloc.amount_cents then
        delete from public.crm_payment_allocations where id = v_alloc.id;
      else
        update public.crm_payment_allocations
          set amount_cents = amount_cents - v_take
          where id = v_alloc.id;
      end if;

      update public.crm_payments
        set unused_amount_cents = coalesce(unused_amount_cents, 0) + v_take
        where id = v_alloc.payment_id
        returning client_id into v_client;

      -- sync_client_balance() treats a payment with an invoice_id and NO
      -- allocation rows as fully applied; once its last allocation here is
      -- gone, detach it so the moved amount actually shows as credit.
      update public.crm_payments p
        set invoice_id = null
        where p.id = v_alloc.payment_id
          and p.invoice_id = p_invoice_id
          and not exists (select 1 from public.crm_payment_allocations a2 where a2.payment_id = p.id);

      if v_client is not null and not (v_client = any(v_clients)) then
        v_clients := v_clients || v_client;
      end if;

      v_excess := v_excess - v_take;
      v_moved := v_moved + v_take;
    end loop;
  end if;

  v_new_paid := v_inv.amount_paid_cents - v_moved;
  v_balance  := greatest(0, v_inv.total_cents - v_new_paid);
  v_status := case
    when v_new_paid > 0 and v_balance = 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    when v_inv.status in ('paid', 'partial') then 'sent'
    else v_inv.status
  end;

  update public.crm_invoices
    set amount_paid_cents = v_new_paid,
        balance_cents     = v_balance,
        status            = v_status
    where id = p_invoice_id;

  perform public.sync_client_balance(v_inv.client_id);
  foreach v_client in array v_clients loop
    if v_client is distinct from v_inv.client_id then
      perform public.sync_client_balance(v_client);
    end if;
  end loop;

  return query select v_status, v_moved, (v_status = 'paid' and v_inv.status is distinct from 'paid');
end;
$function$;

revoke execute on function public.crm_reconcile_invoice_payments(uuid) from public, anon;
grant execute on function public.crm_reconcile_invoice_payments(uuid) to authenticated, service_role;

comment on function public.crm_reconcile_invoice_payments(uuid) is
  'After an invoice total change: moves any amount_paid above total back to the paying payments as unused credit (newest allocation first) and recomputes balance/status.';

-- ─── 2. merge in one transaction ────────────────────────────────────────────
--
-- /api/crm/invoices/merge did ~6 independent writes and the LAST one (voiding
-- the children) was rejected by crm_invoice_block_void_with_payments for any
-- child with payments — because only the allocations had been moved, not the
-- child's amount_paid_cents. Line items and allocations were already on the
-- parent, the parent's totals already rewritten: a half-merge.
--
-- SECURITY INVOKER: every read/write goes through the caller's RLS, exactly as
-- the route's user-scoped client did. Totals are computed by the caller
-- (src/lib/invoice-merge.ts, shared with the preview dialog) and passed in.
create or replace function public.crm_merge_invoices(
  p_parent_id      uuid,
  p_child_ids      uuid[],
  p_subtotal_cents integer,
  p_discount_cents integer,
  p_tax_cents      integer,
  p_total_cents    integer
)
returns table(parent_status text, total_cents integer, amount_paid_cents integer, balance_cents integer)
language plpgsql
security invoker
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_org       uuid := public.my_org_id();
  v_children  uuid[];
  v_all       uuid[];
  v_count     integer;
  v_clients   integer;
  v_client_id uuid;
  v_paid      integer;
  v_parent    record;
  v_balance   integer;
  v_status    text;
begin
  if v_org is null then
    raise exception 'Unauthorized';
  end if;

  select coalesce(array_agg(distinct c), '{}') into v_children
    from unnest(coalesce(p_child_ids, '{}')) c
    where c is not null;
  if cardinality(v_children) = 0 then
    raise exception 'Select at least one invoice to merge';
  end if;
  if p_parent_id = any(v_children) then
    raise exception 'An invoice cannot be merged into itself';
  end if;
  v_all := v_children || p_parent_id;

  perform 1 from public.crm_invoices i where i.id = any(v_all) order by i.id for update;

  select count(*), count(distinct i.client_id), min(i.client_id::text)::uuid,
         coalesce(sum(i.amount_paid_cents), 0)::integer
    into v_count, v_clients, v_client_id, v_paid
    from public.crm_invoices i
    where i.id = any(v_all)
      and i.org_id = v_org
      and i.deleted_at is null;

  if v_count <> cardinality(v_all) then
    raise exception 'One or more invoices not found';
  end if;
  if v_clients > 1 then
    raise exception 'All invoices must belong to the same client';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_all) and i.status = 'void') then
    raise exception 'Cannot merge voided invoices';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_all) and i.locked) then
    raise exception 'Cannot merge locked invoices. Unlock them first.';
  end if;

  select i.id, i.status into v_parent from public.crm_invoices i where i.id = p_parent_id;

  if v_paid > 0 and v_parent.status = 'draft' then
    raise exception 'Payments are applied to these invoices — merge into an issued invoice, not a draft';
  end if;
  if v_paid > p_total_cents then
    raise exception 'The merged total (%) would be less than what has already been paid (%) — adjust the invoices first',
      to_char(p_total_cents / 100.0, 'FM$999,999,990.00'), to_char(v_paid / 100.0, 'FM$999,999,990.00');
  end if;

  update public.crm_invoice_line_items
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  -- Parent totals BEFORE moving allocations: the allocation guard checks the
  -- moved rows against the parent's (new) total.
  update public.crm_invoices
    set subtotal_cents = p_subtotal_cents,
        discount_cents = p_discount_cents,
        tax_cents      = p_tax_cents,
        total_cents    = p_total_cents
    where id = p_parent_id;

  update public.crm_payment_allocations
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  -- Legacy payments predating crm_payment_allocations link via invoice_id.
  update public.crm_payments
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  -- The children's money now lives on the parent: zero it first so the
  -- void guard (which reads OLD.amount_paid_cents) lets the void through.
  update public.crm_invoices
    set amount_paid_cents = 0,
        balance_cents     = 0
    where id = any(v_children);

  update public.crm_invoices
    set status     = 'void',
        deleted_at = now()
    where id = any(v_children);

  v_balance := greatest(0, p_total_cents - v_paid);
  v_status := case
    when v_paid > 0 and v_balance = 0 then 'paid'
    when v_paid > 0 then 'partial'
    when v_parent.status in ('paid', 'partial') then 'sent'
    else v_parent.status
  end;

  update public.crm_invoices
    set amount_paid_cents = v_paid,
        balance_cents     = v_balance,
        status            = v_status
    where id = p_parent_id;

  perform public.sync_client_balance(v_client_id);

  return query select v_status, p_total_cents, v_paid, v_balance;
end;
$function$;

revoke execute on function public.crm_merge_invoices(uuid, uuid[], integer, integer, integer, integer) from public, anon;
grant execute on function public.crm_merge_invoices(uuid, uuid[], integer, integer, integer, integer) to authenticated, service_role;

-- ─── 3. leaving void restores the balance ───────────────────────────────────
--
-- Voiding zeroes balance_cents; setting the invoice back to sent/draft from
-- the status dropdown never restored it, leaving an open invoice with $0 due
-- (invisible to AR, autopay and the "To Charge" queues).
create or replace function public.crm_invoice_restore_balance_on_unvoid()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if old.status = 'void' and new.status is distinct from 'void' then
    new.balance_cents := greatest(0, coalesce(new.total_cents, 0) - coalesce(new.amount_paid_cents, 0));
  end if;
  return new;
end;
$function$;

revoke execute on function public.crm_invoice_restore_balance_on_unvoid() from public, anon, authenticated;

drop trigger if exists trg_crm_invoices_restore_balance_on_unvoid on public.crm_invoices;
create trigger trg_crm_invoices_restore_balance_on_unvoid
  before update of status on public.crm_invoices
  for each row execute function public.crm_invoice_restore_balance_on_unvoid();
