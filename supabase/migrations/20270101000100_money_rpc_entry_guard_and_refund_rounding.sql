-- Money RPCs: only reachable through their sanctioned entry points.
--
-- 1. apply_payment_to_invoice(invoice, delta) is the inner "move amount_paid"
--    step. It is SECURITY DEFINER and granted to authenticated because the
--    SECURITY INVOKER wrappers that call it (crm_record_payment,
--    crm_update_payment, crm_apply_credit_to_invoice) run as the signed-in
--    user. That also let any login holding a payment key call it straight
--    through PostgREST: `apply_payment_to_invoice(inv, total)` marked an
--    invoice paid with no payment row and no allocation, and a negative delta
--    un-paid it.
--
--    refund_payment(payment, amount) is the bookkeeping half of a refund. The
--    refund route calls it with the service role only AFTER Stripe confirmed
--    the refund; called directly with a staff JWT it recorded a refund on a
--    card payment that Stripe never made.
--
--    Both now refuse a staff (authenticated/anon) caller unless the
--    transaction-local GUC app.payment_rpc is 'on'. The three wrappers set it
--    with set_config(..., true) on entry and clear it before returning, so it
--    is on only while one of them is running (PostgREST runs one RPC per
--    transaction; a staff session cannot set GUCs itself). Service-role callers (the
--    refund route, Stripe webhooks: record_stripe_invoice_payment,
--    reconcile_/reinstate_stripe_payment_reversal) and in-database calls with
--    no JWT pass, the same exemption _acct_permitted / _org_mismatch use.
--    refund_payment is additionally revoked from authenticated: nothing staff
--    runs calls it.
--
--    NOTE for future edits: a CREATE OR REPLACE of crm_record_payment /
--    crm_update_payment / crm_apply_credit_to_invoice must keep the
--    set_config('app.payment_rpc', ...) lines, or payments stop recording —
--    loudly, never silently.
--
-- 2. refund_payment's proportional split rounded each allocation's share on
--    its own and clamped the last one, so cents were stranded: allocations
--    5/5/5/1 cents refunded 14 left 1/1/1/0 (3 + 14 refunded = 17 on a 16-cent
--    payment). Shares now use largest-remainder rounding and always add up to
--    the amount being taken off the allocations. Unused credit is still
--    consumed first.
--
-- 3. apply_payment_to_invoice re-opened an unpaid invoice as 'sent' (or
--    'printed'), dropping 'viewed' / 'overdue'. Those are kept now.
--
-- 4. crm_apply_credit_to_invoice let a CHILD account's credit pay its
--    PARENT's invoice; guard_payment_allocation_client_match (the allocation
--    trigger) only allows parent -> child, so it failed later with a raw
--    trigger error. The RPC now applies the same rule up front.
--
-- Definitions below are the live TEST bodies (= newest repo migrations:
-- 20261111020000, 20261130001200) with only the changes above; every
-- existing permission / org / status guard is kept.

create or replace function public._payment_rpc_entry_ok()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select auth.role() = 'service_role'
      or (auth.role() is null and auth.uid() is null)   -- in-database call, no JWT
      or coalesce(current_setting('app.payment_rpc', true), '') = 'on';
$$;
revoke all on function public._payment_rpc_entry_ok() from public, anon;
grant execute on function public._payment_rpc_entry_ok() to authenticated, service_role;

-- ── apply_payment_to_invoice ────────────────────────────────────────────────
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
  -- Only through crm_record_payment / crm_update_payment /
  -- crm_apply_credit_to_invoice (or a service-role / in-database caller):
  -- called on its own it moves money with no payment or allocation behind it.
  if not public._payment_rpc_entry_ok() then
    raise exception 'Payments are applied by recording or editing a payment, not directly' using errcode = '42501';
  end if;
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
  -- An invoice that ends up with nothing paid keeps how far it had got with the
  -- customer (printed / viewed / overdue); only paid/partial fall back to sent.
  v_open_status := case when v_old_status in ('printed', 'viewed', 'overdue') then v_old_status else 'sent' end;
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
revoke all on function public.apply_payment_to_invoice(uuid, integer) from public, anon;
grant execute on function public.apply_payment_to_invoice(uuid, integer) to authenticated, service_role;

-- ── refund_payment ──────────────────────────────────────────────────────────
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
  v_base_sum         integer;
  v_extra            integer;
  v_alloc            record;
  v_count            integer;
begin
  -- The refund route (service role) calls this only after Stripe confirmed the
  -- refund; a staff JWT calling it directly would book a refund Stripe never made.
  if not public._payment_rpc_entry_ok() then
    raise exception 'Refunds are issued from the payment''s Refund action' using errcode = '42501';
  end if;
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

  -- Unapplied credit is given back first; only the rest comes off invoices.
  v_from_unused    := least(p_refund_amount_cents, v_unused);
  v_to_allocations := p_refund_amount_cents - v_from_unused;

  update public.crm_payments
  set refunded_amount_cents = v_new_refunded,
      unused_amount_cents   = v_unused - v_from_unused
  where id = p_payment_id;

  if v_to_allocations > 0 then
    perform 1
      from public.crm_payment_allocations
      where payment_id = p_payment_id
      order by created_at, id
      for update;

    select coalesce(sum(amount_cents), 0), count(*)
      into v_total_allocated, v_count
      from public.crm_payment_allocations
      where payment_id = p_payment_id;

    if v_count > 0 and v_total_allocated > 0 then
      -- Largest-remainder split: every allocation takes floor(R * a / T); the
      -- cents that leaves over go one each to the allocations with the biggest
      -- fractional remainder (oldest first on a tie). The shares add up to
      -- exactly R (capped at the allocations' total), and none exceeds its
      -- allocation because R <= T. The old per-row round()+clamp stranded cents.
      v_to_allocations := least(v_to_allocations, v_total_allocated);

      select coalesce(sum((v_to_allocations::bigint * amount_cents) / v_total_allocated), 0)::integer
        into v_base_sum
        from public.crm_payment_allocations
        where payment_id = p_payment_id;
      v_extra := v_to_allocations - v_base_sum;

      for v_alloc in
        select r.id, r.invoice_id, r.amount_cents,
               least(r.amount_cents,
                     r.base + case when r.rn <= v_extra then 1 else 0 end)::integer as share
          from (
            select a.id, a.invoice_id, a.amount_cents,
                   ((v_to_allocations::bigint * a.amount_cents) / v_total_allocated)::integer as base,
                   row_number() over (
                     order by ((v_to_allocations::bigint * a.amount_cents) % v_total_allocated) desc,
                              a.created_at, a.id
                   ) as rn
              from public.crm_payment_allocations a
              where a.payment_id = p_payment_id
          ) r
          order by r.rn
      loop
        if v_alloc.share > 0 then
          if v_alloc.share >= v_alloc.amount_cents then
            delete from public.crm_payment_allocations where id = v_alloc.id;
          else
            update public.crm_payment_allocations
            set amount_cents = amount_cents - v_alloc.share
            where id = v_alloc.id;
          end if;

          perform public.apply_payment_to_invoice(v_alloc.invoice_id, -v_alloc.share);
        end if;
      end loop;
    elsif v_count = 0 and v_invoice_id is not null then
      -- Legacy single-invoice payment with no allocation rows.
      perform public.apply_payment_to_invoice(v_invoice_id, -v_to_allocations);
    end if;
  end if;

  return query select v_new_refunded;
end;
$function$;
revoke all on function public.refund_payment(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_payment(uuid, integer) to service_role;

-- ── crm_apply_credit_to_invoice ─────────────────────────────────────────────
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
  v_inv_org      uuid;
  v_inv_balance  integer;
  v_inv_status   text;
  v_apply        integer;
begin
  if not public._acct_permitted(array['acct_add_modify_payments','acct_add_modify_credits']) then
    raise exception 'You do not have permission to apply a credit to an invoice' using errcode = '42501';
  end if;
  -- Opens apply_payment_to_invoice for this call only (see the header).
  perform set_config('app.payment_rpc', 'on', true);
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

  select client_id, org_id, coalesce(balance_cents, 0), status
    into v_inv_client, v_inv_org, v_inv_balance, v_inv_status
  from crm_invoices
  where id = p_invoice_id and deleted_at is null
  for update;
  if not found then
    raise exception 'Invoice not found';
  end if;

  -- The credit must be the invoice's own client's, or its PARENT account's (a
  -- property manager's credit can pay a sub-account's invoice). A sub-account's
  -- credit can't pay the parent's invoice — the same rule as
  -- guard_payment_allocation_client_match on every allocation.
  if v_pay_org is distinct from v_inv_org
     or (v_pay_client is distinct from v_inv_client and not exists (
          select 1 from clients c
          where c.id = v_inv_client and c.parent_client_id = v_pay_client
        )) then
    raise exception 'That credit belongs to a different client than this invoice' using errcode = 'check_violation';
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
  if v_pay_client is distinct from v_inv_client then
    perform sync_client_balance(v_pay_client);
  end if;

  perform set_config('app.payment_rpc', '', true);
  return v_apply;
end;
$function$;
revoke all on function public.crm_apply_credit_to_invoice(uuid, uuid, integer) from public, anon;
grant execute on function public.crm_apply_credit_to_invoice(uuid, uuid, integer) to authenticated, service_role;

-- ── the two other sanctioned wrappers: live bodies, entry flag added ───────
-- (A function-level SET of a custom GUC needs superuser on Supabase, so the
-- flag is set with set_config(..., true) and cleared before returning.)
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
  v_inv_clients uuid[] := '{}';
  v_cl         uuid;
begin
  -- Opens apply_payment_to_invoice for this call only (see the header).
  perform set_config('app.payment_rpc', 'on', true);
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
    -- Merge repeated invoice ids first so the balance cap applies to the invoice's
    -- TOTAL requested amount; capping each duplicate separately let N lines each
    -- take up to the full balance and over-apply the invoice.
    select (e->>'invoice_id')::uuid as invoice_id, sum((e->>'amount_cents')::integer)::integer as amount_cents
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
    where (e->>'amount_cents')::integer > 0
    group by (e->>'invoice_id')::uuid
    order by (e->>'invoice_id')::uuid
  loop
    if v_alloc.amount_cents is null or v_alloc.amount_cents <= 0 then
      continue;
    end if;
    select id, client_id, invoice_number, status, coalesce(balance_cents, 0) as balance_cents
      into v_inv from crm_invoices where id = v_alloc.invoice_id;
    if not found then
      raise exception 'One of the selected invoices no longer exists';
    end if;
    -- The invoice must belong to the paying client, or to a child (sub-account) of it: a single
    -- check from a property manager can be spread across the parent's and its children's invoices.
    -- Without this, a payment recorded for client A could pay down client B's invoice.
    if v_inv.client_id is distinct from p_client_id and not exists (
      select 1 from clients c where c.id = v_inv.client_id and c.parent_client_id = p_client_id
    ) then
      raise exception 'Invoice #% belongs to a different client than this payment',
        coalesce(v_inv.invoice_number::text, '—');
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
      v_inv_clients := v_inv_clients || v_inv.client_id;
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
  -- Child accounts whose invoices were paid keep a cached balance too.
  for v_cl in select distinct c from unnest(v_inv_clients) c where c is distinct from p_client_id loop
    perform sync_client_balance(v_cl);
  end loop;

  perform set_config('app.payment_rpc', '', true);
  return jsonb_build_object(
    'payment_id', v_payment_id,
    'newly_paid_invoice_ids', to_jsonb(v_newly_ids),
    'has_allocations', v_count > 0
  );
end;
$function$;
revoke all on function public.crm_record_payment(uuid, integer, date, text, text, text, boolean, boolean, jsonb) from public, anon;
grant execute on function public.crm_record_payment(uuid, integer, date, text, text, text, boolean, boolean, jsonb) to authenticated, service_role;

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
  v_keep       text[];
  v_header_changed boolean;
begin
  -- Opens apply_payment_to_invoice for this call only (see the header).
  perform set_config('app.payment_rpc', 'on', true);
  if not public._acct_permitted(case when coalesce((select is_credit from public.crm_payments where id = p_payment_id), false) then array['acct_add_modify_credits'] else array['acct_add_modify_payments'] end) then
    raise exception 'You do not have permission to edit a payment or credit' using errcode = '42501';
  end if;
  select invoice_id, amount_cents, coalesce(refunded_amount_cents, 0) as refunded_amount_cents,
         coalesce(unused_amount_cents, 0) as unused_amount_cents, stripe_payment_intent_id,
         payment_date, reference
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
    select (e->>'invoice_id')::uuid as invoice_id, sum((e->>'amount_cents')::integer)::integer as amount_cents
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
    group by 1
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

  -- Re-inserting the allocations used to drop their QuickBooks payment ids, so the sync cron
  -- pushed the same payment a second time. Carry the link over for every invoice that keeps an
  -- allocation (one link per invoice: the oldest); every other link is queued to be voided in
  -- QuickBooks. A carried link whose amount, date or reference changed is flagged for the sync.
  perform set_config('app.payment_qbo_link_rpc', 'on', true);
  v_header_changed := p_payment_date is distinct from v_cur.payment_date
                      or nullif(trim(coalesce(p_reference, '')), '') is distinct from nullif(trim(coalesce(v_cur.reference, '')), '');

  create temp table if not exists _upd_pay_qbo (
    invoice_id uuid, qbo_payment_id text, qbo_sync_error text, qbo_sync_attempted_at timestamptz,
    link_amount_cents integer, created_at timestamptz
  ) on commit drop;
  delete from _upd_pay_qbo;
  insert into _upd_pay_qbo
    select distinct on (a.invoice_id)
           a.invoice_id, a.qbo_payment_id, a.qbo_sync_error, a.qbo_sync_attempted_at,
           a.amount_cents,
           (select min(a2.created_at) from crm_payment_allocations a2
             where a2.payment_id = p_payment_id and a2.invoice_id = a.invoice_id)
    from crm_payment_allocations a
    where a.payment_id = p_payment_id
    order by a.invoice_id, (a.qbo_payment_id is null), a.created_at, a.id;

  select coalesce(array_agg(q.qbo_payment_id), '{}'::text[]) into v_keep
    from _upd_pay_qbo q
    where q.qbo_payment_id is not null
      and q.invoice_id in (select (e->>'invoice_id')::uuid from jsonb_array_elements(v_resolved) e);
  perform public._crm_queue_qbo_pending_voids(p_payment_id, v_keep);

  delete from crm_payment_allocations where payment_id = p_payment_id;
  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    insert into crm_payment_allocations (payment_id, invoice_id, amount_cents, qbo_payment_id, qbo_sync_error, qbo_sync_attempted_at, created_at)
    select p_payment_id, (v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer,
           q.qbo_payment_id,
           case when q.qbo_payment_id is null then null
                when q.link_amount_cents is distinct from (v_elem->>'amount_cents')::integer or v_header_changed
                then 'Changed in Landscapt — waiting to update the QuickBooks payment.'
                else q.qbo_sync_error end,
           case when q.qbo_payment_id is null then null
                when q.link_amount_cents is distinct from (v_elem->>'amount_cents')::integer or v_header_changed
                then null
                else q.qbo_sync_attempted_at end,
           coalesce(q.created_at, now())
    from (select 1) _x
    left join _upd_pay_qbo q on q.invoice_id = (v_elem->>'invoice_id')::uuid;
  end loop;
  perform set_config('app.payment_qbo_link_rpc', '', true);

  for v_elem in select * from jsonb_array_elements(v_resolved) loop
    perform apply_payment_to_invoice((v_elem->>'invoice_id')::uuid, (v_elem->>'amount_cents')::integer);
  end loop;

  perform sync_client_balance(p_client_id);

  perform set_config('app.payment_rpc', '', true);
  return jsonb_build_object('payment_id', p_payment_id);
end;
$function$;
revoke all on function public.crm_update_payment(uuid, uuid, integer, date, text, text, text, jsonb) from public, anon;
grant execute on function public.crm_update_payment(uuid, uuid, integer, date, text, text, text, jsonb) to authenticated, service_role;
