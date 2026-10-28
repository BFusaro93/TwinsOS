-- crm_record_payment: merge duplicate invoice ids in one call before capping to
-- the invoice balance. Otherwise the same invoice listed twice in p_allocations
-- was capped per-entry, so the two entries together could exceed the balance.
-- Signature, search_path, permission check and grants are unchanged from
-- 20261111020000_money_rpcs_require_acct_permissions.sql.

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
