-- Consolidate invoices from a parent account's sub-accounts into ONE new
-- invoice on the parent, so a property manager can be billed for several
-- properties together.
--
-- crm_merge_invoices only merges invoices on the SAME client and keeps one of
-- the existing invoices. Sub-accounts are separate clients, so that path can't
-- bill them together. This creates a new invoice on the parent client, moves
-- every source invoice's line items (prefixed with the sub-account name so the
-- customer sees which property each line is for), moves payments/allocations,
-- and voids the originals with a link back (consolidated_into_id).
--
-- Totals are the exact SUM of the sources (subtotal, discount, tax, total), so
-- each line keeps the tax it was already charged even when sub-accounts have
-- different rates. Nothing is recomputed from a single rate, and nothing is
-- taken from the caller. tax_rate_bps is the shared rate, or a blended one for
-- display when the sources differ.

alter table public.crm_invoices
  add column if not exists consolidated_into_id uuid references public.crm_invoices(id);

create index if not exists crm_invoices_consolidated_into_idx
  on public.crm_invoices (consolidated_into_id)
  where consolidated_into_id is not null;

create or replace function public.crm_consolidate_invoices(
  p_parent_client_id uuid,
  p_invoice_ids      uuid[]
)
returns table(invoice_id uuid, total_cents integer, amount_paid_cents integer, balance_cents integer, status text)
language plpgsql
security invoker
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_org       uuid := public.my_org_id();
  v_ids       uuid[];
  v_count     integer;
  v_parent    record;
  v_new_id    uuid;
  v_sub       integer;
  v_disc      integer;
  v_tax       integer;
  v_total     integer;
  v_paid      integer;
  v_balance   integer;
  v_status    text;
  v_rates     integer;
  v_rate      integer;
  v_taxable   bigint;
  v_terms     text;
  v_due       date;
  v_client    uuid;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to consolidate invoices' using errcode = '42501';
  end if;
  if v_org is null then
    raise exception 'Unauthorized';
  end if;

  select coalesce(array_agg(distinct x), '{}') into v_ids
    from unnest(coalesce(p_invoice_ids, '{}')) x where x is not null;
  if cardinality(v_ids) < 2 then
    raise exception 'Select at least two invoices to consolidate';
  end if;

  select c.id, c.parent_client_id, c.default_payment_method
    into v_parent
    from public.clients c
    where c.id = p_parent_client_id and c.org_id = v_org and c.deleted_at is null;
  if not found then
    raise exception 'Parent account not found';
  end if;
  if v_parent.parent_client_id is not null then
    raise exception 'That account is itself a sub-account — pick its parent account';
  end if;

  perform 1 from public.crm_invoices i where i.id = any(v_ids) order by i.id for update;

  select count(*) into v_count
    from public.crm_invoices i
    where i.id = any(v_ids) and i.org_id = v_org and i.deleted_at is null;
  if v_count <> cardinality(v_ids) then
    raise exception 'One or more invoices not found';
  end if;

  -- Every invoice must be the parent's own or belong to one of its sub-accounts.
  if exists (
    select 1 from public.crm_invoices i
    join public.clients c on c.id = i.client_id
    where i.id = any(v_ids)
      and c.id <> p_parent_client_id
      and c.parent_client_id is distinct from p_parent_client_id
  ) then
    raise exception 'Every invoice must belong to the parent account or one of its sub-accounts';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_ids) and i.status = 'void') then
    raise exception 'Cannot consolidate voided invoices';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_ids) and i.locked) then
    raise exception 'Cannot consolidate locked invoices. Unlock them first.';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_ids) and i.pending_payment_intent_id is not null) then
    raise exception 'Cannot consolidate an invoice with a payment still processing (bank debit in flight). Wait for it to settle.';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_ids) and i.qbo_invoice_id is not null) then
    raise exception 'Cannot consolidate an invoice already synced to QuickBooks. Void or handle it in QuickBooks first.';
  end if;
  if exists (select 1 from public.crm_invoices i where i.id = any(v_ids) and i.open_dispute_payment_id is not null) then
    raise exception 'Cannot consolidate an invoice with an open payment dispute';
  end if;

  -- A payment a sub-account made stays on that sub-account (a payment can only
  -- be allocated to its own client's invoices or a child's, never a parent's
  -- invoice). Payments the PARENT made, e.g. one check covering several
  -- sub-account invoices, belong on the parent's new invoice and move with it.
  if exists (
    select 1 from public.crm_payment_allocations a
    join public.crm_payments p on p.id = a.payment_id
    where a.invoice_id = any(v_ids) and p.client_id <> p_parent_client_id
  ) or exists (
    select 1 from public.crm_payments p
    where p.invoice_id = any(v_ids) and p.deleted_at is null and p.client_id <> p_parent_client_id
  ) then
    raise exception 'A sub-account has already made a payment on one of these invoices. Consolidate only invoices with no sub-account payments, or merge those invoices within the sub-account first.';
  end if;

  select coalesce(sum(i.subtotal_cents), 0), coalesce(sum(i.discount_cents), 0),
         coalesce(sum(i.tax_cents), 0), coalesce(sum(i.total_cents), 0),
         coalesce(sum(i.amount_paid_cents), 0),
         count(distinct i.tax_rate_bps), min(i.tax_rate_bps), max(i.due_date)
    into v_sub, v_disc, v_tax, v_total, v_paid, v_rates, v_rate, v_due
    from public.crm_invoices i where i.id = any(v_ids);

  -- Sources with different rates: show the blended effective rate (tax over the
  -- net taxable lines). The stored tax_cents is still the exact sum.
  if v_rates > 1 then
    select coalesce(sum(li.total_cents - li.discount_cents), 0) into v_taxable
      from public.crm_invoice_line_items li
      where li.invoice_id = any(v_ids) and li.is_taxable;
    v_rate := case when v_taxable > 0 then round(v_tax::numeric * 10000 / v_taxable)::integer else 0 end;
  end if;

  select i.terms into v_terms
    from public.crm_invoices i where i.id = any(v_ids)
    order by i.invoice_date desc limit 1;

  insert into public.crm_invoices (
    client_id, description, invoice_date, terms, due_date, status,
    subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
    amount_paid_cents, balance_cents, preferred_payment_method, created_by
  ) values (
    p_parent_client_id,
    'Consolidated invoice',
    public.org_today(v_org),
    v_terms, v_due,
    -- Payments can only be applied to issued invoices, so one that inherits
    -- payments starts issued; otherwise it's a draft to review and send.
    case when v_paid > 0 then 'sent' else 'draft' end,
    v_sub, v_disc, coalesce(v_rate, 0), v_tax, v_total,
    0, v_total, v_parent.default_payment_method, auth.uid()
  ) returning id into v_new_id;

  -- Line items: tag each with the sub-account it came from, then move.
  update public.crm_invoice_line_items li
    set description = '[' || coalesce(nullif(c.display_name, ''), 'Account') || '] ' || li.description,
        invoice_id  = v_new_id
    from public.crm_invoices i
    join public.clients c on c.id = i.client_id
    where li.invoice_id = i.id
      and i.id = any(v_ids)
      and li.org_id = v_org
      and c.id <> p_parent_client_id;

  update public.crm_invoice_line_items
    set invoice_id = v_new_id
    where invoice_id = any(v_ids) and org_id = v_org;

  update public.crm_payment_allocations
    set invoice_id = v_new_id
    where invoice_id = any(v_ids) and org_id = v_org;

  update public.crm_payments
    set invoice_id = v_new_id
    where invoice_id = any(v_ids) and org_id = v_org;

  -- Zero the sources first: voiding an invoice that still carries a paid amount
  -- is rejected by crm_invoice_block_void_with_payments.
  update public.crm_invoices
    set amount_paid_cents = 0, balance_cents = 0
    where id = any(v_ids);

  update public.crm_invoices
    set status = 'void', deleted_at = now(), consolidated_into_id = v_new_id
    where id = any(v_ids);

  v_balance := greatest(0, v_total - v_paid);
  v_status := case
    when v_paid > 0 and v_balance = 0 then 'paid'
    when v_paid > 0 then 'partial'
    else 'draft'
  end;

  update public.crm_invoices
    set amount_paid_cents = v_paid, balance_cents = v_balance, status = v_status
    where id = v_new_id;

  -- Drafts are numbered when first issued; one carrying payments is already issued.
  if v_status <> 'draft' then
    perform public.assign_invoice_number(v_new_id);
  end if;

  for v_client in
    select distinct i.client_id from public.crm_invoices i where i.id = any(v_ids) or i.id = v_new_id
  loop
    perform public.sync_client_balance(v_client);
  end loop;

  return query select v_new_id, v_total, v_paid, v_balance, v_status;
end;
$function$;

revoke all on function public.crm_consolidate_invoices(uuid, uuid[]) from public, anon;
grant execute on function public.crm_consolidate_invoices(uuid, uuid[]) to authenticated, service_role;
