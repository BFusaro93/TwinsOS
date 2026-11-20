-- crm_update_payment cleared its temp table with a bare `delete from _upd_pay_qbo;`. The database's
-- safe-update guard (pg-safeupdate, on for PostgREST sessions) rejects any DELETE without a WHERE
-- clause, so Edit Payment failed with "DELETE requires a WHERE clause" for every edit. `where true`
-- satisfies the guard and deletes the same rows. Body is otherwise the live definition, unchanged
-- (the set_config('app.payment_rpc', ...) lines and the entry guard are kept). Grants are preserved
-- by CREATE OR REPLACE. Re-check the PROD definition (pg_get_functiondef) matches before applying.

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
  delete from _upd_pay_qbo where true;
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
