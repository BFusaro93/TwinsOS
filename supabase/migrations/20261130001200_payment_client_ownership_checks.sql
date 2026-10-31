-- Two money RPCs trusted the caller on which client's money pays which client's invoice:
--  * crm_record_payment never checked that the invoices in p_allocations belong to p_client_id (or
--    one of its child accounts), so a payment for client A could pay down client B's invoice, and
--    B's cached balance was never re-synced.
--  * crm_apply_credit_to_invoice selected the credit's client and never compared it to the
--    invoice's, so any unused credit could be spent on any invoice in the org.
-- Both now require the same client or a parent/child account, and re-sync every client touched.
-- Both stay SECURITY INVOKER with the acct permission check restated.
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

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'newly_paid_invoice_ids', to_jsonb(v_newly_ids),
    'has_allocations', v_count > 0
  );
end;
$function$
;

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

  -- The credit must be the invoice's own client's (or a parent/child account of it): any
  -- credit payment could otherwise be spent on another client's invoice.
  if v_pay_org is distinct from v_inv_org
     or (v_pay_client is distinct from v_inv_client and not exists (
          select 1 from clients c
          where (c.id = v_inv_client and c.parent_client_id = v_pay_client)
             or (c.id = v_pay_client and c.parent_client_id = v_inv_client)
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

  return v_apply;
end;
$function$
;
