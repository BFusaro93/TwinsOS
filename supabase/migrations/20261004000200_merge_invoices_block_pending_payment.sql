-- crm_merge_invoices(): refuse to merge away an invoice that has a charge in
-- flight. A child with pending_payment_intent_id set (e.g. an ACH debit that
-- takes days to settle) was voided + soft-deleted by the merge, leaving the
-- marker on a dead row: when the debit succeeded, the payment webhook would
-- apply it against a voided child instead of the merged parent. Body copied
-- from 20260927100300; only the pending-payment guard is new.
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
  if exists (select 1 from public.crm_invoices i where i.id = any(v_children) and i.pending_payment_intent_id is not null) then
    raise exception 'Cannot merge an invoice with a payment still processing (bank debit in flight). Wait for it to settle, then merge.';
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
