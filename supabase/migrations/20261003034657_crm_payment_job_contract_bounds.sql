-- Edge-case sweep: zero payments, negative job quantities and reversed contract
-- dates were all accepted. UI and functions now reject them; these CHECKs are
-- the backstop. NOT VALID: enforced for new/updated rows without failing on
-- historical data.

-- 1. crm_record_payment: reject non-positive amounts. Previously only NULL was
--    rejected; a negative amount failed by accident ("allocated exceeds payment")
--    and 0 was recorded as a $0.00 payment. Body is otherwise unchanged.
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

alter table crm_payments drop constraint if exists crm_payments_amount_positive;
alter table crm_payments
  add constraint crm_payments_amount_positive
  check (amount_cents > 0) not valid;

-- 2. Job services: no negative quantity, rate or budgeted hours.
alter table crm_job_services drop constraint if exists crm_job_services_nonnegative;
alter table crm_job_services
  add constraint crm_job_services_nonnegative
  check (qty >= 0 and rate_cents >= 0 and budgeted_hours >= 0) not valid;

-- 3. Contracts: end date can't precede start date.
alter table crm_contracts drop constraint if exists crm_contracts_dates_ordered;
alter table crm_contracts
  add constraint crm_contracts_dates_ordered
  check (end_date is null or start_date is null or end_date >= start_date) not valid;
