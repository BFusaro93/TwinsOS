-- Recording / editing a manual payment as ONE transaction.
--
-- useRecordPayment / useUpdatePayment ran a chain of separate client-side
-- statements (insert payment, insert allocations, apply_payment_to_invoice per
-- invoice, sync_client_balance). A failure or closed tab part-way left a payment
-- row with allocations but unmoved invoice balances (or, on edit, invoices
-- reversed but the new split never applied). Same fix as
-- crm_apply_credit_to_invoice (20260913180000): security INVOKER plpgsql, so RLS
-- and the allocation guard triggers still apply, with row locks on the payment
-- and invoices so concurrent edits serialise.
--
-- p_allocations: jsonb array of {"invoice_id": uuid, "amount_cents": int}.
-- Allocations are normalised exactly as the old resolveAllocations() did: drop
-- non-positive rows, reject missing / draft / void invoices, cap each at the
-- invoice's open balance (plus, on edit, what this payment already had applied
-- there). Whatever is capped off stays on the payment as unused credit.

create or replace function public.crm_record_payment(
  p_client_id     uuid,
  p_amount_cents  integer,
  p_payment_date  date,
  p_method        text,
  p_reference     text,
  p_memo          text,
  p_is_prepayment boolean,
  p_is_credit     boolean,
  p_allocations   jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
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
  if p_amount_cents is null then
    raise exception 'Payment amount is required';
  end if;

  -- Lock the invoices being paid, in id order, so concurrent payments can't
  -- deadlock or both cap against the same stale balance.
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

  -- Record the split FIRST so the allocation guard trigger can reject an
  -- over-allocation before any invoice balance moves.
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

revoke execute on function public.crm_record_payment(uuid, integer, date, text, text, text, boolean, boolean, jsonb) from public, anon;
grant  execute on function public.crm_record_payment(uuid, integer, date, text, text, text, boolean, boolean, jsonb) to authenticated, service_role;


create or replace function public.crm_update_payment(
  p_payment_id    uuid,
  p_client_id     uuid,
  p_amount_cents  integer,
  p_payment_date  date,
  p_method        text,
  p_reference     text,
  p_memo          text,
  p_allocations   jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $function$
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

  -- Lock every invoice this payment touches (old and new split), in id order.
  perform 1 from crm_invoices
    where id in (
      select invoice_id from crm_payment_allocations where payment_id = p_payment_id
      union
      select (e->>'invoice_id')::uuid from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
      union
      select v_cur.invoice_id where v_cur.invoice_id is not null
    )
    order by id for update;

  -- Validate + cap the NEW split before anything is reversed.
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

  -- Reverse the ORIGINAL allocations (legacy allocation-less payments fall back
  -- to the single invoice_id: amount less refunds less whatever sits unused).
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

  -- Amount first: the allocation guard checks the split against it.
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

revoke execute on function public.crm_update_payment(uuid, uuid, integer, date, text, text, text, jsonb) from public, anon;
grant  execute on function public.crm_update_payment(uuid, uuid, integer, date, text, text, text, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
