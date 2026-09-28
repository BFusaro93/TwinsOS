-- Atomic recording of a succeeded Stripe PaymentIntent against CRM invoices.
--
-- src/lib/stripe/record-charge.ts used to do this as five separate
-- auto-committed statements: read the invoice (unlocked) -> clamp -> insert
-- crm_payments -> apply_payment_to_invoice() -> insert
-- crm_payment_allocations. When the LAST step failed (e.g. the allocation
-- guard trigger rejecting an over-allocation or a draft/void invoice),
-- amount_paid_cents had already risen and the payment row already existed:
-- the webhook returned 500, Stripe retried, the retry hit the unique index on
-- stripe_payment_intent_id and returned "already_recorded" — leaving an
-- invoice showing paid > total and a payment with no allocation (money lost
-- from the client's credit).
--
-- This function does the whole thing in ONE transaction:
--   * idempotent on the PaymentIntent id (advisory lock + existence check;
--     the unique index stays as the backstop) — a repeat returns
--     'already_recorded' with no side effects
--   * locks every target invoice FOR UPDATE (in id order, no deadlocks)
--   * merges duplicate invoice ids in the requested split
--   * clamps each applied amount to the LIVE remaining balance (and to the
--     allocation headroom the guard trigger enforces); a draft, void or
--     soft-deleted invoice gets 0 — it is never un-voided, the money becomes
--     client credit instead
--   * inserts the payment with unused_amount_cents = amount - applied, the
--     allocations, and updates amount_paid/balance/status with the SAME
--     status rules as apply_payment_to_invoice() (incl. 'printed'), assigning
--     an invoice number if the invoice has none
--
-- The money amounts here are the NET amounts owed on the invoices (the
-- PaymentIntent's balance_cents / encoded allocations); the card processing
-- fee is recorded separately in processing_fee_cents, as before.
--
-- Service role only: the callers are the Connect webhook and the synchronous
-- off-session charge routes, both of which use the service-role client and
-- verify the connected account owns p_org_id before calling.

create or replace function public.record_stripe_invoice_payment(
  p_org_id            uuid,
  p_client_id         uuid,
  p_payment_intent_id text,
  p_allocations       jsonb,   -- [{"invoice_id": "<uuid>", "amount_cents": <int>}]
  p_fee_cents         integer,
  p_method            text,
  p_payment_date      date,
  p_channel_label     text     -- 'card' | 'bank transfer' (memo wording only)
)
returns table(
  result                 text,
  payment_id             uuid,
  amount_cents           integer,
  applied_cents          integer,
  unused_cents           integer,
  newly_paid_invoice_ids uuid[]
)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_existing       uuid;
  v_req            record;
  v_inv            record;
  v_allocated      integer;
  v_apply          integer;
  v_total          integer := 0;
  v_applied_total  integer := 0;
  v_applied        jsonb := '[]'::jsonb;
  v_elem           jsonb;
  v_invoice_count  integer := 0;
  v_single_invoice uuid;
  v_payment_id     uuid;
  v_unused         integer;
  v_label          text := coalesce(nullif(p_channel_label, ''), 'card');
  v_new_paid       integer;
  v_new_balance    integer;
  v_open_status    text;
  v_new_status     text;
  v_newly_paid     uuid[] := '{}';
begin
  if p_payment_intent_id is null or length(p_payment_intent_id) = 0 then
    raise exception 'A Stripe PaymentIntent id is required';
  end if;
  if p_org_id is null or p_client_id is null then
    raise exception 'org and client are required';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'At least one invoice allocation is required';
  end if;

  -- Serialize concurrent writers for the same PaymentIntent (webhook vs the
  -- synchronous charge route) so the loser sees the winner's committed row.
  perform pg_advisory_xact_lock(hashtextextended('crm_payment_pi:' || p_payment_intent_id, 0));

  select p.id into v_existing
    from public.crm_payments p
    where p.stripe_payment_intent_id = p_payment_intent_id;
  if found then
    return query select 'already_recorded'::text, v_existing, null::integer, null::integer, null::integer, '{}'::uuid[];
    return;
  end if;

  if not exists (select 1 from public.clients c where c.id = p_client_id and c.org_id = p_org_id) then
    raise exception 'Client % not found in this organization', p_client_id;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_allocations) e
    where (e->>'invoice_id') is null
       or (e->>'amount_cents') is null
       or (e->>'amount_cents')::integer <= 0
  ) then
    raise exception 'Every allocation needs an invoice_id and a positive amount_cents';
  end if;

  -- Pass 1: lock + clamp. Duplicate invoice ids in the split are merged.
  for v_req in
    select (e->>'invoice_id')::uuid as invoice_id,
           sum((e->>'amount_cents')::integer)::integer as amount_cents
      from jsonb_array_elements(p_allocations) e
      group by 1
      order by 1
  loop
    select i.id, i.org_id, i.client_id, i.status, i.total_cents, i.amount_paid_cents, i.deleted_at
      into v_inv
      from public.crm_invoices i
      where i.id = v_req.invoice_id
      for update;

    if not found or v_inv.org_id is distinct from p_org_id then
      raise exception 'Invoice % not found in this organization', v_req.invoice_id;
    end if;

    -- Same rule as guard_payment_allocation_client_match: the payment's
    -- client or one of its child sub-accounts.
    if v_inv.client_id is distinct from p_client_id
       and not exists (
         select 1 from public.clients c
         where c.id = v_inv.client_id and c.parent_client_id = p_client_id
       ) then
      raise exception 'Invoice % does not belong to client %', v_req.invoice_id, p_client_id;
    end if;

    if v_inv.deleted_at is not null or v_inv.status in ('draft', 'void') then
      -- Never apply to (or un-void) these — the whole share becomes credit.
      v_apply := 0;
    else
      select coalesce(sum(a.amount_cents), 0)::integer into v_allocated
        from public.crm_payment_allocations a
        where a.invoice_id = v_inv.id;
      v_apply := greatest(0, least(
        v_req.amount_cents,
        v_inv.total_cents - v_inv.amount_paid_cents,
        v_inv.total_cents - v_allocated
      ));
    end if;

    v_invoice_count := v_invoice_count + 1;
    v_total := v_total + v_req.amount_cents;
    v_applied_total := v_applied_total + v_apply;
    v_applied := v_applied || jsonb_build_object('invoice_id', v_inv.id, 'amount_cents', v_apply);
    if v_apply > 0 then
      v_single_invoice := v_inv.id;
    end if;
  end loop;

  v_unused := v_total - v_applied_total;

  -- crm_payments.invoice_id is only set for a single-invoice payment that
  -- actually landed on it. sync_client_balance() treats a payment with an
  -- invoice_id and NO allocation rows as fully applied (legacy fallback), so
  -- setting it on a payment credited entirely to the account (voided invoice)
  -- would make that credit vanish.
  if v_invoice_count <> 1 or v_applied_total = 0 then
    v_single_invoice := null;
  end if;

  insert into public.crm_payments (
    org_id, invoice_id, client_id, amount_cents, unused_amount_cents,
    payment_date, method, memo, is_prepayment, processing_fee_cents,
    stripe_payment_intent_id
  ) values (
    p_org_id, v_single_invoice, p_client_id, v_total, v_unused,
    p_payment_date, p_method,
    case when v_unused > 0
      then format('Paid online via %s (exceeds invoice balance — excess credited to account)', v_label)
      else format('Paid online via %s', v_label)
    end,
    false, coalesce(p_fee_cents, 0), p_payment_intent_id
  )
  returning id into v_payment_id;

  -- Pass 2: allocations + invoice balances (rows still locked from pass 1).
  for v_elem in select * from jsonb_array_elements(v_applied)
  loop
    v_apply := (v_elem->>'amount_cents')::integer;
    continue when v_apply <= 0;

    insert into public.crm_payment_allocations (org_id, payment_id, invoice_id, amount_cents)
    values (p_org_id, v_payment_id, (v_elem->>'invoice_id')::uuid, v_apply);

    select i.id, i.status, i.total_cents, i.amount_paid_cents, i.invoice_number
      into v_inv
      from public.crm_invoices i
      where i.id = (v_elem->>'invoice_id')::uuid;

    -- Mirrors apply_payment_to_invoice()'s status rules exactly.
    v_new_paid    := greatest(0, v_inv.amount_paid_cents + v_apply);
    v_new_balance := greatest(0, v_inv.total_cents - v_new_paid);
    v_open_status := case when v_inv.status = 'printed' then 'printed' else 'sent' end;
    v_new_status  := case
      when v_new_balance <= 0 then 'paid'
      when v_new_paid > 0 then 'partial'
      else v_open_status
    end;

    update public.crm_invoices
      set amount_paid_cents = v_new_paid,
          balance_cents     = v_new_balance,
          status            = v_new_status
      where id = v_inv.id;

    if v_inv.invoice_number is null then
      perform public.assign_invoice_number(v_inv.id);
    end if;

    if v_new_status = 'paid' and v_inv.status is distinct from 'paid' then
      v_newly_paid := v_newly_paid || v_inv.id;
    end if;
  end loop;

  perform public.sync_client_balance(p_client_id);

  return query select 'applied'::text, v_payment_id, v_total, v_applied_total, v_unused, v_newly_paid;
end;
$function$;

revoke execute on function public.record_stripe_invoice_payment(uuid, uuid, text, jsonb, integer, text, date, text)
  from public, anon, authenticated;
grant execute on function public.record_stripe_invoice_payment(uuid, uuid, text, jsonb, integer, text, date, text)
  to service_role;

comment on function public.record_stripe_invoice_payment(uuid, uuid, text, jsonb, integer, text, date, text) is
  'Records a succeeded Stripe PaymentIntent (crm_invoice / crm_invoice_multi) atomically: idempotent on the intent id, clamps to live balances, excess -> unused credit, never un-voids. Service role only.';

-- apply_payment_to_invoice() is deliberately NOT changed to clamp at the
-- invoice total. Its other callers (useRecordPayment/useUpdatePayment,
-- crm_apply_credit_to_invoice, refund_payment) insert/keep allocation rows
-- for the exact delta they pass; silently clamping amount_paid there would
-- break sum(allocations) = amount_paid without crediting the excess anywhere.
-- Those callers already clamp before calling it, and the allocation guard
-- trigger rejects over-allocation.
