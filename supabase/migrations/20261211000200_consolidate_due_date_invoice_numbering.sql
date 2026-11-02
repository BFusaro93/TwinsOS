-- Invoice numbering and consolidation fixes (2026-11-02 sweep leftovers).
--
-- 1. crm_consolidate_invoices: the consolidated invoice's due date was the latest SOURCE due
--    date, which could already be past, so the new invoice was overdue the day it was issued.
--    It now runs from the new invoice date and its terms. Body = 20261130000500 + that.
-- 2. set_next_invoice_number: the invoice counter is seeded no lower than the highest live
--    invoice number, and the function returns the number the next invoice will actually get.
--    Body = 20261203000400 + that (estimate/ticket seeding and permission check unchanged).
-- 3. get_invoice_numbering: orgs not on per-org numbering no longer see the shared sequence's
--    value (it leaks other tenants' volume); next_number is null for them.

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
  v_inv_date  date;
  v_days      integer;
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

  -- The due date runs from the new invoice's own date and terms. The latest source due
  -- date could already be past, making the consolidated invoice overdue on the day it was
  -- issued. Unknown terms keep the latest source due date, never earlier than today.
  v_inv_date := public.org_today(v_org);
  v_days := case v_terms
    when 'due_on_receipt' then 0 when 'net_10' then 10 when 'net_15' then 15
    when 'net_30' then 30 when 'net_45' then 45 when 'net_60' then 60 when 'net_90' then 90
    else null end;
  v_due := case when v_days is not null then v_inv_date + v_days
                else greatest(coalesce(v_due, v_inv_date), v_inv_date) end;

  insert into public.crm_invoices (
    client_id, description, invoice_date, terms, due_date, status,
    subtotal_cents, discount_cents, tax_rate_bps, tax_cents, total_cents,
    amount_paid_cents, balance_cents, preferred_payment_method, created_by
  ) values (
    p_parent_client_id,
    'Consolidated invoice',
    v_inv_date,
    v_terms, v_due,
    -- Payments can only be applied to issued invoices, so one that inherits
    -- payments starts issued; otherwise it's a draft to review and send.
    case when v_paid > 0 then 'sent' else 'draft' end,
    v_sub, v_disc, coalesce(v_rate, 0), v_tax, v_total,
    0, v_total, v_parent.default_payment_method, auth.uid()
  ) returning id into v_new_id;

  -- Line items: tag each with the sub-account it came from, then move.
  update public.crm_invoice_line_items li
    -- Line descriptions can be rich-text HTML (e.g. "<p>…</p>"): put the tag
    -- inside the first element, not in front of it, so no markup is left
    -- dangling outside a block.
    set description = case
          when li.description ~ '^<[a-zA-Z][^>]*>'
            then regexp_replace(li.description, '^(<[a-zA-Z][^>]*>)',
                   '\1[' || replace(replace(coalesce(nullif(c.display_name, ''), 'Account'), '\', '\\'), '&', '\&') || '] ')
          else '[' || coalesce(nullif(c.display_name, ''), 'Account') || '] ' || li.description
        end,
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

  -- Milestones billed on the sources are still billed, on the new invoice.
  update public.estimate_milestones
    set invoice_id = v_new_id
    where invoice_id = any(v_ids);

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

create or replace function public.set_next_invoice_number(p_next integer)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_was_per_org boolean;
  v_max integer;
  v_seed integer;
begin
  if v_org is null then
    raise exception 'No organization for the current user' using errcode = '42501';
  end if;
  -- The card lives on Settings > Accounting (accounting_settings); the seeded Accounting
  -- role has that key without crm_settings, so accept either.
  if not (public.my_role() in ('admin', 'manager')
          or coalesce(public.has_settings_permission('crm_settings'), false)
          or coalesce(public.has_settings_permission('accounting_settings'), false)) then
    raise exception 'Not permitted to change invoice numbering' using errcode = '42501';
  end if;
  if p_next is null or p_next < 1 or p_next > 2000000000 then
    raise exception 'Invoice number must be between 1 and 2,000,000,000' using errcode = '22023';
  end if;

  select coalesce(per_org_numbering, false) into v_was_per_org from public.organizations where id = v_org for update;

  if not v_was_per_org then
    -- Estimates and tickets switch to per-org counters with the same flag: continue from the
    -- org's current highest number instead of restarting at 1.
    insert into public.entity_number_counters (org_id, entity_type, period, count)
    values (v_org, 'estimate', 'all',
            coalesce((select max(e.estimate_number) from public.estimates e where e.org_id = v_org), 0))
    on conflict (org_id, entity_type, period) do nothing;

    insert into public.entity_number_counters (org_id, entity_type, period, count)
    values (v_org, 'crm_ticket', 'all',
            coalesce((select max(t.ticket_number) from public.crm_tickets t where t.org_id = v_org), 0))
    on conflict (org_id, entity_type, period) do nothing;
  end if;

  update public.organizations set per_org_numbering = true where id = v_org;

  -- Never seed below the highest live invoice number: assign_invoice_number skips numbers in
  -- use one at a time, so a start far below them looped through thousands of numbers inside
  -- a single invoice's transaction. Numbering continues after the highest existing one.
  select max(i.invoice_number) into v_max
    from public.crm_invoices i where i.org_id = v_org and i.deleted_at is null;
  v_seed := greatest(p_next - 1, coalesce(v_max, 0));

  insert into public.entity_number_counters (org_id, entity_type, period, count)
  values (v_org, 'crm_invoice', 'all', v_seed)
  on conflict (org_id, entity_type, period) do update set count = v_seed;

  return v_seed + 1;
end;
$function$;
revoke all on function public.set_next_invoice_number(integer) from public, anon;
grant execute on function public.set_next_invoice_number(integer) to authenticated;

create or replace function public.get_invoice_numbering()
returns table(next_number integer, max_existing integer, per_org boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_org uuid := public.my_org_id();
  v_per_org boolean;
  v_next integer;
begin
  if v_org is null then
    raise exception 'No organization for the current user' using errcode = '42501';
  end if;
  select coalesce(o.per_org_numbering, false) into v_per_org from organizations o where o.id = v_org;
  if v_per_org then
    select coalesce(c.count, 0) + 1 into v_next
      from entity_number_counters c
     where c.org_id = v_org and c.entity_type = 'crm_invoice' and c.period = 'all';
    v_next := coalesce(v_next, 1);
  else
    -- Not on per-org numbering: the next number comes from the shared sequence, whose value
    -- reveals other tenants' invoice volume. Report it as automatic instead.
    v_next := null;
  end if;
  return query
    select v_next,
           (select max(i.invoice_number) from crm_invoices i where i.org_id = v_org and i.deleted_at is null),
           v_per_org;
end;
$function$;
revoke all on function public.get_invoice_numbering() from public, anon;
grant execute on function public.get_invoice_numbering() to authenticated;
