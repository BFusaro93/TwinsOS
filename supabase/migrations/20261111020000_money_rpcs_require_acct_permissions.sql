-- The billing-money RPCs authorised only on org membership (RLS /
-- _org_mismatch). The acct_* permission gates lived in the UI and in a few API
-- routes, so any CRM-access login (e.g. a view-only or crew role) could call
-- refund_payment / crm_record_payment / ... straight through PostgREST with its
-- own JWT. Each function now also requires the matching acct_* key for staff
-- callers, checked INSIDE the function.
--
-- Service-role callers (Stripe webhooks, the refund route which has already
-- checked the key and then uses the admin client, crons) and in-database calls
-- with no JWT are exempt, exactly like _org_mismatch(). Admins pass through
-- has_settings_permission(). Definitions below are the LIVE PROD bodies with
-- only the guard added; security definer/invoker, search_path and grants are
-- restated. reconcile_stripe_payment_reversal / reinstate_* /
-- record_stripe_invoice_payment are service_role-only already and untouched.

create or replace function public._acct_permitted(p_keys text[])
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_key text;
begin
  if auth.role() = 'service_role' then
    return true;
  end if;
  if auth.role() is null and auth.uid() is null then
    return true;  -- in-database (cron/trigger) call, no JWT
  end if;
  foreach v_key in array coalesce(p_keys, '{}'::text[]) loop
    if public.has_settings_permission(v_key) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
revoke all on function public._acct_permitted(text[]) from public, anon;
grant execute on function public._acct_permitted(text[]) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refund_payment(p_payment_id uuid, p_refund_amount_cents integer)
 RETURNS TABLE(new_refunded_amount_cents integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id           uuid;
  v_amount_cents     integer;
  v_old_refunded     integer;
  v_unused           integer;
  v_invoice_id       uuid;
  v_new_refunded     integer;
  v_from_unused      integer;
  v_to_allocations   integer;
  v_total_allocated  integer;
  v_remaining        integer;
  v_share            integer;
  v_alloc            record;
  v_idx              integer := 0;
  v_count            integer;
begin
  if not public._acct_permitted(array['acct_process_cc_refunds_voids','acct_delete_card_payments','acct_delete_ach_payments']) then
    raise exception 'You do not have permission to refund or void a payment' using errcode = '42501';
  end if;
  select org_id, amount_cents, refunded_amount_cents,
         coalesce(unused_amount_cents, 0), invoice_id
    into v_org_id, v_amount_cents, v_old_refunded, v_unused, v_invoice_id
    from public.crm_payments
    where id = p_payment_id
    for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if p_refund_amount_cents <= 0 then
    raise exception 'Refund amount must be positive';
  end if;

  v_new_refunded := v_old_refunded + p_refund_amount_cents;

  if v_new_refunded > v_amount_cents then
    raise exception 'Refund amount exceeds remaining refundable balance';
  end if;

  v_from_unused    := least(p_refund_amount_cents, v_unused);
  v_to_allocations := p_refund_amount_cents - v_from_unused;

  update public.crm_payments
  set refunded_amount_cents = v_new_refunded,
      unused_amount_cents   = v_unused - v_from_unused
  where id = p_payment_id;

  if v_to_allocations > 0 then
    select coalesce(sum(amount_cents), 0), count(*)
      into v_total_allocated, v_count
      from public.crm_payment_allocations
      where payment_id = p_payment_id;

    if v_count > 0 then
      v_remaining := v_to_allocations;

      for v_alloc in
        select id, invoice_id, amount_cents
          from public.crm_payment_allocations
          where payment_id = p_payment_id
          order by created_at, id
          for update
      loop
        v_idx := v_idx + 1;

        if v_idx = v_count then
          v_share := v_remaining;
        else
          v_share := round((v_to_allocations::numeric * v_alloc.amount_cents) / v_total_allocated);
        end if;

        v_share := least(v_share, v_alloc.amount_cents, v_remaining);

        if v_share > 0 then
          v_remaining := v_remaining - v_share;

          if v_share >= v_alloc.amount_cents then
            delete from public.crm_payment_allocations where id = v_alloc.id;
          else
            update public.crm_payment_allocations
            set amount_cents = amount_cents - v_share
            where id = v_alloc.id;
          end if;

          perform public.apply_payment_to_invoice(v_alloc.invoice_id, -v_share);
        end if;
      end loop;
    elsif v_invoice_id is not null then
      perform public.apply_payment_to_invoice(v_invoice_id, -v_to_allocations);
    end if;
  end if;

  return query select v_new_refunded;
end;
$function$;

revoke all on function public.refund_payment(uuid,integer) from public, anon;
grant execute on function public.refund_payment(uuid,integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_payment_to_invoice(p_invoice_id uuid, p_delta_cents integer)
 RETURNS TABLE(new_status text, was_newly_paid boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id      uuid;
  v_total_cents integer;
  v_old_paid    integer;
  v_old_status  text;
  v_new_paid    integer;
  v_new_balance integer;
  v_open_status text;
  v_new_status  text;
  v_number      integer;
begin
  if not public._acct_permitted(array['acct_add_modify_payments','acct_add_modify_credits','acct_process_cc_refunds_voids','acct_delete_card_payments','acct_delete_ach_payments']) then
    raise exception 'You do not have permission to apply money to an invoice' using errcode = '42501';
  end if;
  select org_id, total_cents, amount_paid_cents, status, invoice_number
    into v_org_id, v_total_cents, v_old_paid, v_old_status, v_number
    from public.crm_invoices
    where id = p_invoice_id
    for update;

  if not found then
    raise exception 'Invoice not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if v_old_status = 'void' then
    return query select v_old_status, false;
    return;
  end if;

  v_new_paid := greatest(0, v_old_paid + p_delta_cents);
  v_new_balance := greatest(0, v_total_cents - v_new_paid);
  v_open_status := case when v_old_status = 'printed' then 'printed' else 'sent' end;
  v_new_status := case
    when v_new_balance <= 0 then 'paid'
    when v_new_paid > 0 then 'partial'
    else v_open_status
  end;

  update public.crm_invoices
  set amount_paid_cents = v_new_paid,
      balance_cents = v_new_balance,
      status = v_new_status
  where id = p_invoice_id;

  if v_number is null then
    perform public.assign_invoice_number(p_invoice_id);
  end if;

  return query select v_new_status, (v_new_status = 'paid' and v_old_status is distinct from 'paid');
end;
$function$;

revoke all on function public.apply_payment_to_invoice(uuid,integer) from public, anon;
grant execute on function public.apply_payment_to_invoice(uuid,integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_record_payment(p_client_id uuid, p_amount_cents integer, p_payment_date date, p_method text, p_reference text, p_memo text, p_is_prepayment boolean, p_is_credit boolean, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_alloc      record;
  v_inv        record;
  v_cap        integer;
  v_amt        integer;
  v_resolved   jsonb := '[]'::jsonb;
  v_allocated  integer := 0;
  v_count      integer := 0;
  v_primary    uuid := null;
  v_payment_id uuid;
  v_new_status text;
  v_newly_paid boolean;
  v_newly_ids  uuid[] := '{}';
  v_elem       jsonb;
begin
  if not public._acct_permitted(case when coalesce(p_is_credit, false) then array['acct_add_modify_credits'] else array['acct_add_modify_payments'] end) then
    raise exception 'You do not have permission to record a payment or credit' using errcode = '42501';
  end if;
  if p_amount_cents is null then
    raise exception 'Payment amount is required';
  end if;
  if p_amount_cents <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  perform 1 from crm_invoices
    where id in (
      select (e->>'invoice_id')::uuid from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
    )
    order by id for update;

  for v_alloc in
    select (e->>'invoice_id')::uuid as invoice_id, (e->>'amount_cents')::integer as amount_cents
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
  loop
    if v_alloc.amount_cents is null or v_alloc.amount_cents <= 0 then
      continue;
    end if;
    select id, invoice_number, status, coalesce(balance_cents, 0) as balance_cents
      into v_inv from crm_invoices where id = v_alloc.invoice_id;
    if not found then
      raise exception 'One of the selected invoices no longer exists';
    end if;
    if v_inv.status in ('draft', 'void') then
      raise exception 'Invoice #% is % — payments can only be applied to issued invoices',
        coalesce(v_inv.invoice_number::text, '—'), v_inv.status;
    end if;
    v_cap := greatest(0, v_inv.balance_cents);
    v_amt := least(v_alloc.amount_cents, v_cap);
    if v_amt > 0 then
      v_resolved := v_resolved || jsonb_build_object('invoice_id', v_alloc.invoice_id, 'amount_cents', v_amt);
      v_allocated := v_allocated + v_amt;
      v_count := v_count + 1;
      v_primary := v_alloc.invoice_id;
    end if;
  end loop;

  if v_allocated > p_amount_cents then
    raise exception 'Allocated amount exceeds the payment amount';
  end if;
  if v_count <> 1 then
    v_primary := null;
  end if;

  insert into crm_payments (
    created_by, invoice_id, client_id, amount_cents, unused_amount_cents,
    payment_date, method, reference, memo, is_prepayment, is_credit
  ) values (
    auth.uid(), v_primary, p_client_id, p_amount_cents, p_amount_cents - v_allocated,
    p_payment_date, p_method, p_reference, p_memo,
    coalesce(p_is_prepayment, false), coalesce(p_is_credit, false)
  ) returning id into v_payment_id;

  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    insert into crm_payment_allocations (payment_id, invoice_id, amount_cents)
    values (v_payment_id, (v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer);
  end loop;

  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    select s.new_status, s.was_newly_paid into v_new_status, v_newly_paid
      from apply_payment_to_invoice((v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer) s;
    if v_newly_paid then
      v_newly_ids := v_newly_ids || (v_elem->>'invoice_id')::uuid;
    end if;
  end loop;

  perform sync_client_balance(p_client_id);

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'newly_paid_invoice_ids', to_jsonb(v_newly_ids),
    'has_allocations', v_count > 0
  );
end;
$function$;

revoke all on function public.crm_record_payment(uuid,integer,date,text,text,text,boolean,boolean,jsonb) from public, anon;
grant execute on function public.crm_record_payment(uuid,integer,date,text,text,text,boolean,boolean,jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_update_payment(p_payment_id uuid, p_client_id uuid, p_amount_cents integer, p_payment_date date, p_method text, p_reference text, p_memo text, p_allocations jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_cur        record;
  v_refunded   integer;
  v_alloc      record;
  v_old        record;
  v_inv        record;
  v_prior      integer;
  v_cap        integer;
  v_amt        integer;
  v_resolved   jsonb := '[]'::jsonb;
  v_allocated  integer := 0;
  v_count      integer := 0;
  v_primary    uuid := null;
  v_legacy     integer;
  v_elem       jsonb;
begin
  if not public._acct_permitted(case when coalesce((select is_credit from public.crm_payments where id = p_payment_id), false) then array['acct_add_modify_credits'] else array['acct_add_modify_payments'] end) then
    raise exception 'You do not have permission to edit a payment or credit' using errcode = '42501';
  end if;
  select invoice_id, amount_cents, coalesce(refunded_amount_cents, 0) as refunded_amount_cents,
         coalesce(unused_amount_cents, 0) as unused_amount_cents, stripe_payment_intent_id
    into v_cur
    from crm_payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  v_refunded := v_cur.refunded_amount_cents;

  if v_cur.stripe_payment_intent_id is not null and p_amount_cents is distinct from v_cur.amount_cents then
    raise exception 'This payment was made online — its amount can''t be changed. Issue a refund instead.';
  end if;
  if p_amount_cents < v_refunded then
    raise exception 'The payment amount can''t be less than what has already been refunded';
  end if;

  perform 1 from crm_invoices
    where id in (
      select invoice_id from crm_payment_allocations where payment_id = p_payment_id
      union
      select (e->>'invoice_id')::uuid from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
      union
      select v_cur.invoice_id where v_cur.invoice_id is not null
    )
    order by id for update;

  for v_alloc in
    select (e->>'invoice_id')::uuid as invoice_id, (e->>'amount_cents')::integer as amount_cents
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
  loop
    if v_alloc.amount_cents is null or v_alloc.amount_cents <= 0 then
      continue;
    end if;
    select id, invoice_number, status, coalesce(balance_cents, 0) as balance_cents
      into v_inv from crm_invoices where id = v_alloc.invoice_id;
    if not found then
      raise exception 'One of the selected invoices no longer exists';
    end if;
    if v_inv.status in ('draft', 'void') then
      raise exception 'Invoice #% is % — payments can only be applied to issued invoices',
        coalesce(v_inv.invoice_number::text, '—'), v_inv.status;
    end if;
    select coalesce(sum(amount_cents), 0) into v_prior
      from crm_payment_allocations where payment_id = p_payment_id and invoice_id = v_alloc.invoice_id;
    v_cap := greatest(0, v_inv.balance_cents + v_prior);
    v_amt := least(v_alloc.amount_cents, v_cap);
    if v_amt > 0 then
      v_resolved := v_resolved || jsonb_build_object('invoice_id', v_alloc.invoice_id, 'amount_cents', v_amt);
      v_allocated := v_allocated + v_amt;
      v_count := v_count + 1;
      v_primary := v_alloc.invoice_id;
    end if;
  end loop;
  if v_count <> 1 then
    v_primary := null;
  end if;

  if v_allocated > p_amount_cents - v_refunded then
    if v_refunded > 0 then
      raise exception 'Allocated amount exceeds what''s left of this payment after refunds';
    else
      raise exception 'Allocated amount exceeds the payment amount';
    end if;
  end if;

  if exists (select 1 from crm_payment_allocations where payment_id = p_payment_id) then
    for v_old in
      select invoice_id, amount_cents from crm_payment_allocations where payment_id = p_payment_id
    loop
      perform apply_payment_to_invoice(v_old.invoice_id, -v_old.amount_cents);
    end loop;
  elsif v_cur.invoice_id is not null then
    v_legacy := greatest(0, v_cur.amount_cents - v_refunded - v_cur.unused_amount_cents);
    if v_legacy > 0 then
      perform apply_payment_to_invoice(v_cur.invoice_id, -v_legacy);
    end if;
  end if;

  update crm_payments set
    invoice_id          = v_primary,
    amount_cents        = p_amount_cents,
    unused_amount_cents = greatest(0, p_amount_cents - v_refunded - v_allocated),
    payment_date        = p_payment_date,
    method              = p_method,
    reference           = p_reference,
    memo                = p_memo
  where id = p_payment_id;

  delete from crm_payment_allocations where payment_id = p_payment_id;
  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    insert into crm_payment_allocations (payment_id, invoice_id, amount_cents)
    values (p_payment_id, (v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer);
  end loop;

  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    perform apply_payment_to_invoice((v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer);
  end loop;

  perform sync_client_balance(p_client_id);

  return jsonb_build_object('payment_id', p_payment_id);
end;
$function$;

revoke all on function public.crm_update_payment(uuid,uuid,integer,date,text,text,text,jsonb) from public, anon;
grant execute on function public.crm_update_payment(uuid,uuid,integer,date,text,text,text,jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_apply_credit_to_invoice(p_payment_id uuid, p_invoice_id uuid, p_amount_cents integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_pay_client   uuid;
  v_pay_org      uuid;
  v_pay_unused   integer;
  v_inv_client   uuid;
  v_inv_balance  integer;
  v_inv_status   text;
  v_apply        integer;
begin
  if not public._acct_permitted(array['acct_add_modify_payments','acct_add_modify_credits']) then
    raise exception 'You do not have permission to apply a credit to an invoice' using errcode = '42501';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Nothing to apply';
  end if;

  select client_id, org_id, coalesce(unused_amount_cents, 0)
    into v_pay_client, v_pay_org, v_pay_unused
  from crm_payments
  where id = p_payment_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  select client_id, coalesce(balance_cents, 0), status
    into v_inv_client, v_inv_balance, v_inv_status
  from crm_invoices
  where id = p_invoice_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  if v_inv_status in ('draft', 'void') then
    raise exception 'Money can only be applied to an issued invoice (this one is %)', v_inv_status
      using errcode = 'check_violation';
  end if;

  v_apply := least(p_amount_cents, v_pay_unused, v_inv_balance);
  if v_apply <= 0 then
    raise exception 'Nothing left to apply';
  end if;

  insert into crm_payment_allocations (org_id, payment_id, invoice_id, amount_cents)
  values (v_pay_org, p_payment_id, p_invoice_id, v_apply);

  update crm_payments
  set unused_amount_cents = v_pay_unused - v_apply
  where id = p_payment_id;

  perform apply_payment_to_invoice(p_invoice_id, v_apply);
  perform sync_client_balance(v_inv_client);

  return v_apply;
end;
$function$;

revoke all on function public.crm_apply_credit_to_invoice(uuid,uuid,integer) from public, anon;
grant execute on function public.crm_apply_credit_to_invoice(uuid,uuid,integer) to authenticated, service_role;

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

revoke all on function public.crm_merge_invoices(uuid,uuid[],integer,integer,integer,integer) from public, anon;
grant execute on function public.crm_merge_invoices(uuid,uuid[],integer,integer,integer,integer) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_invoice_from_milestone(p_milestone_id uuid, p_client_id uuid, p_sales_rep_id uuid DEFAULT NULL::uuid, p_po_number text DEFAULT NULL::text)
 RETURNS TABLE(invoice_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id      uuid;
  v_estimate_id uuid;
  v_project_id  uuid;
  v_name        text;
  v_amount      integer;
  v_status      text;
  v_type        text;
  v_value       integer;
  v_basis       integer;
  v_invoice_id  uuid;
  v_deleted_at  timestamptz;
  v_client_id   uuid;
  v_est_client  uuid;
  v_proj_client uuid;
  v_terms       text;
  v_inv_date    date;
  v_days        integer;
begin
  if not public._acct_permitted(array['acct_add_modify_invoices']) then
    raise exception 'You do not have permission to invoice a milestone' using errcode = '42501';
  end if;
  select org_id, estimate_id, project_id, name, amount_cents, status, milestone_type, milestone_value, deleted_at
    into v_org_id, v_estimate_id, v_project_id, v_name, v_amount, v_status, v_type, v_value, v_deleted_at
    from public.estimate_milestones
    where id = p_milestone_id
    for update;

  if not found then
    raise exception 'Milestone not found';
  end if;

  if public._org_mismatch(v_org_id) then
    raise exception 'Unauthorized';
  end if;

  if v_deleted_at is not null then
    raise exception 'Milestone has been deleted';
  end if;

  if v_status = 'invoiced' then
    raise exception 'Milestone already invoiced';
  end if;

  if v_project_id is null and v_estimate_id is not null then
    select j.project_id into v_project_id
    from public.crm_jobs j
    where j.estimate_id = v_estimate_id
      and j.project_id is not null
      and j.deleted_at is null
    limit 1;
  end if;

  if v_estimate_id is not null then
    declare
      v_est_deleted timestamptz;
      v_est_stage   text;
      v_est_org     uuid;
    begin
      select deleted_at, stage, org_id, client_id
        into v_est_deleted, v_est_stage, v_est_org, v_est_client
        from public.estimates where id = v_estimate_id;
      if not found or v_est_deleted is not null then
        raise exception 'Milestone''s estimate has been deleted';
      end if;
      if v_est_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
      if v_est_stage = 'lost' then
        raise exception 'Cannot invoice a milestone on a lost estimate';
      end if;
    end;
  end if;

  if v_project_id is not null then
    declare
      v_proj_deleted timestamptz;
      v_proj_org     uuid;
    begin
      select deleted_at, org_id, client_id
        into v_proj_deleted, v_proj_org, v_proj_client
        from public.projects where id = v_project_id;
      if not found or v_proj_deleted is not null then
        raise exception 'Milestone''s project has been deleted';
      end if;
      if v_proj_org is distinct from v_org_id then
        raise exception 'Unauthorized';
      end if;
    end;
  end if;

  v_client_id := coalesce(v_est_client, v_proj_client);
  if v_client_id is null then
    if not exists (
      select 1 from public.clients c
      where c.id = p_client_id and c.org_id = v_org_id and c.deleted_at is null
    ) then
      raise exception 'Invalid client for this milestone';
    end if;
    v_client_id := p_client_id;
  elsif p_client_id is not null and p_client_id is distinct from v_client_id then
    raise exception 'Client does not match the milestone''s estimate/project';
  end if;

  if v_type = 'percent' then
    if v_project_id is not null then
      select contract_price into v_basis from public.projects where id = v_project_id;
    else
      select total_cents into v_basis from public.estimates where id = v_estimate_id;
    end if;

    if coalesce(v_basis, 0) > 0 then
      v_amount := round(v_basis::numeric * v_value / 10000);
    end if;
  end if;

  if coalesce(v_amount, 0) <= 0 then
    raise exception 'Milestone amount must be greater than zero';
  end if;

  select terms into v_terms from (
    select c.default_terms as terms, 1 as pri from public.clients c where c.id = v_client_id
    union all
    select o.default_billing_terms, 2 from public.organizations o where o.id = v_org_id
  ) t
  where terms in ('due_on_receipt','net_10','net_15','net_30','net_45','net_60','net_90')
  order by pri
  limit 1;
  v_terms := coalesce(v_terms, 'due_on_receipt');
  v_days := case v_terms
    when 'net_10' then 10 when 'net_15' then 15 when 'net_30' then 30
    when 'net_45' then 45 when 'net_60' then 60 when 'net_90' then 90
    else 0 end;
  v_inv_date := public.org_today(v_org_id);

  insert into public.crm_invoices (
    org_id, created_by, client_id, estimate_id, project_id, sales_rep_id, description,
    invoice_date, terms, due_date, po_number, subtotal_cents, total_cents, balance_cents, status
  ) values (
    v_org_id, auth.uid(), v_client_id, v_estimate_id, v_project_id, p_sales_rep_id, v_name,
    v_inv_date, v_terms, v_inv_date + v_days,
    p_po_number, v_amount, v_amount, v_amount, 'draft'
  )
  returning id into v_invoice_id;

  insert into public.crm_invoice_line_items (
    org_id, invoice_id, name, description, qty, rate_cents, total_cents, sort_order
  ) values (
    v_org_id, v_invoice_id, v_name, '', 1, v_amount, v_amount, 0
  );

  update public.estimate_milestones
  set status = 'invoiced', invoice_id = v_invoice_id, amount_cents = v_amount
  where id = p_milestone_id;

  return query select v_invoice_id;
end;
$function$;

revoke all on function public.create_invoice_from_milestone(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.create_invoice_from_milestone(uuid,uuid,uuid,text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_reconcile_invoice_payments(p_invoice_id uuid)
 RETURNS TABLE(new_status text, moved_to_credit_cents integer, was_newly_paid boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not public._acct_permitted(array['acct_add_modify_invoices','acct_add_modify_payments','acct_add_modify_credits']) then
    raise exception 'You do not have permission to reconcile invoice payments' using errcode = '42501';
  end if;
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

revoke all on function public.crm_reconcile_invoice_payments(uuid) from public, anon;
grant execute on function public.crm_reconcile_invoice_payments(uuid) to authenticated, service_role;
