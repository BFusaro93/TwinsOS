-- A contract invoice merged into another (crm_merge_invoices child) was void + deleted with no
-- marker, so neither contract-billing idempotency filter (deleted_at is null OR
-- consolidated_into_id is not null) saw it and the period could be billed again. Body is the
-- 20261130000500 definition plus the consolidated_into_id stamp on the children.
CREATE OR REPLACE FUNCTION public.crm_merge_invoices(p_parent_id uuid, p_child_ids uuid[], p_subtotal_cents integer, p_discount_cents integer, p_tax_cents integer, p_total_cents integer)
 RETURNS TABLE(parent_status text, total_cents integer, amount_paid_cents integer, balance_cents integer)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to merge invoices' using errcode = '42501';
  end if;
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

  if exists (select 1 from public.crm_invoices i where i.id = any(v_children) and i.qbo_invoice_id is not null) then
    raise exception 'Cannot merge an invoice already synced to QuickBooks. Void or handle it in QuickBooks first.';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_children) and i.open_dispute_payment_id is not null) then
    raise exception 'Cannot merge an invoice with an open payment dispute';
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
  -- moved rows against the parent's (new) total. The combined discount is a
  -- flat amount, so drop the parent's percent/applied-discount bookkeeping.
  update public.crm_invoices
    set subtotal_cents      = p_subtotal_cents,
        discount_cents      = p_discount_cents,
        discount_type       = null,
        discount_value      = null,
        applied_discount_id = null,
        tax_cents           = p_tax_cents,
        total_cents         = p_total_cents
    where id = p_parent_id;

  update public.crm_payment_allocations
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  update public.crm_payments
    set invoice_id = p_parent_id
    where invoice_id = any(v_children)
      and org_id = v_org;

  update public.crm_invoices
    set amount_paid_cents = 0,
        balance_cents     = 0
    where id = any(v_children);

  -- A milestone billed on a merged invoice is still billed, on the parent: keep it
  -- linked instead of letting the void trigger release it for re-billing.
  update public.estimate_milestones
    set invoice_id = p_parent_id
    where invoice_id = any(v_children);

  -- consolidated_into_id marks a source whose charge now lives on another invoice; the
  -- contract-invoice idempotency checks (cron + Create Invoices) count such a source as
  -- billed. A merged child is the same case, so stamp it too — without this a merged
  -- contract invoice let the month be billed a second time.
  update public.crm_invoices
    set status               = 'void',
        deleted_at           = now(),
        consolidated_into_id = p_parent_id
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

