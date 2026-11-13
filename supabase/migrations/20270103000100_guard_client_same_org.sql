-- Cross-org client links (round 13, security).
--
-- Every table with a single-column FK to public.clients accepted a client_id
-- belonging to ANOTHER org: RLS only checks the row's own org_id, and a plain
-- FK only checks that the client exists. Someone who learned another org's
-- client UUID could plant contacts/activity/jobs/invoices/enrollments on it;
-- sync_client_balance then summed those rows into the victim client's balance,
-- and the sequence processor emailed the victim org's customer.
--
-- 1. guard_client_same_org(): one generic BEFORE INSERT/UPDATE trigger,
--    attached to every FK-to-clients table that has an org_id column
--    (discovered from pg_constraint, the same way crm_merge_clients finds
--    them). Raises 23503 when the referenced client's org differs from
--    NEW.org_id. Applies to every writer — service role, SECURITY DEFINER
--    RPCs and cascades included — because a cross-org link is never valid.
--    Named zz_* so it runs after any BEFORE trigger that fills org_id.
-- 2. sync_client_balance only sums invoices/payments/allocations in the
--    client's own org.
--
-- PROD: apply BEFORE the code deploy (old code never writes cross-org links;
-- the round-13 PROD pre-check for existing cross-org rows must return 0 rows,
-- or later updates of those rows would fail).

create or replace function public.guard_client_same_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_col        text := tg_argv[0];
  v_client_id  uuid;
  v_client_org uuid;
begin
  if v_col is null then
    raise exception 'guard_client_same_org: column name argument required';
  end if;

  v_client_id := nullif(to_jsonb(new) ->> v_col, '')::uuid;
  if v_client_id is null or new.org_id is null then
    return new;  -- nothing linked, or NOT NULL on org_id reports it
  end if;

  if tg_op = 'UPDATE'
     and v_client_id is not distinct from nullif(to_jsonb(old) ->> v_col, '')::uuid
     and new.org_id is not distinct from old.org_id then
    return new;
  end if;

  select c.org_id into v_client_org from public.clients c where c.id = v_client_id;
  if not found then
    return new;  -- the FK itself reports a missing client
  end if;

  if v_client_org is distinct from new.org_id then
    raise exception 'client % does not belong to this organization', v_client_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_client_same_org() from public, anon, authenticated;

do $$
declare
  r record;
  v_trg text;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.clients'::regclass
      and array_length(c.conkey, 1) = 1
      and exists (
        select 1 from pg_attribute o
        where o.attrelid = c.conrelid and o.attname = 'org_id' and not o.attisdropped
      )
  loop
    v_trg := left('zz_guard_client_same_org_' || r.col, 63);
    execute format('drop trigger if exists %I on %s', v_trg, r.tbl);
    execute format(
      'create trigger %I before insert or update of %I, org_id on %s
         for each row execute function public.guard_client_same_org(%L)',
      v_trg, r.col, r.tbl, r.col
    );
  end loop;
end;
$$;

-- sync_client_balance: live TEST definition, with every sum restricted to the
-- client's own org.
create or replace function public.sync_client_balance(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org uuid;
begin
  if auth.uid() is not null
     and pg_trigger_depth() = 0
     and not exists (
       select 1 from clients c
       where c.id = p_client_id and c.org_id = public.my_org_id()
     ) then
    raise exception 'client not found' using errcode = '42501';
  end if;

  select c.org_id into v_org from clients c where c.id = p_client_id;
  if v_org is null then
    return;
  end if;

  update clients
  set
    balance_outstanding_cents = coalesce(
      (select sum(balance_cents)
       from crm_invoices
       where client_id = p_client_id
         and org_id = v_org
         and deleted_at is null
         and status not in ('void', 'draft')),
      0
    ),
    balance_uninvoiced_cents = coalesce(
      (select sum(total_cents)
       from crm_invoices
       where client_id = p_client_id
         and org_id = v_org
         and deleted_at is null
         and status = 'draft'),
      0
    ),
    balance_prepay_cents = coalesce(
      (
        select sum(
          greatest(0,
            p.amount_cents - p.refunded_amount_cents -
            coalesce(alloc.total_cents, case when p.invoice_id is not null then p.amount_cents else 0 end)
          )
        )
        from crm_payments p
        left join (
          select payment_id, sum(amount_cents) as total_cents
          from crm_payment_allocations
          where org_id = v_org
          group by payment_id
        ) alloc on alloc.payment_id = p.id
        where p.client_id = p_client_id
          and p.org_id = v_org
          and p.is_prepayment = true
          and p.deleted_at is null
      ),
      0
    ),
    balance_credits_cents = coalesce(
      (
        select sum(
          greatest(0,
            p.amount_cents - p.refunded_amount_cents -
            coalesce(alloc.total_cents, case when p.invoice_id is not null then p.amount_cents else 0 end)
          )
        )
        from crm_payments p
        left join (
          select payment_id, sum(amount_cents) as total_cents
          from crm_payment_allocations
          where org_id = v_org
          group by payment_id
        ) alloc on alloc.payment_id = p.id
        where p.client_id = p_client_id
          and p.org_id = v_org
          and p.is_prepayment = false
          and p.deleted_at is null
      ),
      0
    )
  where id = p_client_id;
end;
$function$;
