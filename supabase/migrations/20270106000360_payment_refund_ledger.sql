-- Refunds get their own date: crm_payment_refunds.
--
-- crm_payments.refunded_amount_cents is a running total with no date, so cash
-- reports subtracted a refund from the month the PAYMENT was received — a
-- March refund of a January payment rewrote January's closed numbers and
-- never showed in March. Every change to refunded_amount_cents now also writes
-- a dated ledger row:
--   * refund_payment() (staff refunds, and Stripe refunds / dispute
--     withdrawals via reconcile_stripe_payment_reversal) — a positive row;
--   * reinstate_stripe_payment_reversal() (dispute won / funds reinstated) —
--     a negative row.
-- So per payment, sum(amount_cents) = refunded_amount_cents always.
-- fee_cents is the refunded share of the card processing fee, from running
-- totals so split refunds add up exactly: round(fee × refunded_after / amount)
-- − round(fee × refunded_before / amount) — the same split the refund route
-- uses for the gross it refunds through Stripe. A payment's fee net of refunds
-- is therefore fee − round(fee × refunded / amount).
-- refund_date is the org-local day the refund was recorded.
--
-- Existing refunds are backfilled with ONE row each, dated the payment's own
-- date (when they happened wasn't recorded), so every report's history is
-- unchanged.
--
-- Read: same rule as crm_payments (org members with CRM access, not crew).
-- Write: only the two SECURITY DEFINER functions above — no write policies.
--
-- Safe BEFORE the deploy (the old code doesn't read the table; the functions
-- keep their signatures and behaviour and only add the ledger insert).

create table if not exists public.crm_payment_refunds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  payment_id uuid not null references public.crm_payments(id),
  amount_cents integer not null,
  fee_cents integer not null default 0,
  refund_date date not null,
  source text not null default 'refund' check (source in ('refund', 'reinstated', 'backfill')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  deleted_at timestamptz
);

create index if not exists crm_payment_refunds_org_date_idx
  on public.crm_payment_refunds (org_id, refund_date) where deleted_at is null;
create index if not exists crm_payment_refunds_payment_idx
  on public.crm_payment_refunds (payment_id);

alter table public.crm_payment_refunds enable row level security;
revoke all on table public.crm_payment_refunds from public, anon, authenticated;
grant select on table public.crm_payment_refunds to authenticated;
grant all on table public.crm_payment_refunds to service_role;

drop policy if exists crm_payment_refunds_select on public.crm_payment_refunds;
create policy crm_payment_refunds_select on public.crm_payment_refunds
  for select
  using (
    org_id = (select public.my_org_id())
    and (select public.my_role()) is distinct from 'crew'
    and (select public.has_crm_access())
  );

-- Backfill: one row per already-refunded payment, on the payment's own date.
insert into public.crm_payment_refunds (org_id, payment_id, amount_cents, fee_cents, refund_date, source, created_by)
select p.org_id,
       p.id,
       p.refunded_amount_cents,
       case when coalesce(p.processing_fee_cents, 0) > 0 and p.amount_cents > 0
            then round(p.processing_fee_cents::numeric * p.refunded_amount_cents / p.amount_cents)::integer
            else 0 end,
       coalesce(p.payment_date, (p.created_at at time zone public.org_timezone(p.org_id))::date),
       'backfill',
       null
  from public.crm_payments p
 where coalesce(p.refunded_amount_cents, 0) <> 0
   and not exists (select 1 from public.crm_payment_refunds r where r.payment_id = p.id);

-- Patch the ledger insert INTO the live functions, so none of their guards or
-- other branches are restated here.
do $$
declare
  v_src text;
  v_needle text;
  v_patch text;
begin
  -- refund_payment: right after refunded_amount_cents moves up.
  v_src := pg_get_functiondef('public.refund_payment(uuid,integer)'::regprocedure);
  if position('crm_payment_refunds' in v_src) = 0 then
    v_needle := E'  update public.crm_payments\n  set refunded_amount_cents = v_new_refunded,\n      unused_amount_cents   = v_unused - v_from_unused\n  where id = p_payment_id;\n';
    v_patch :=
         E'\n  -- Dated ledger row (20270106000360): cash reports take the refund in its own month.\n'
      || E'  insert into public.crm_payment_refunds (org_id, payment_id, amount_cents, fee_cents, refund_date, source)\n'
      || E'  select p.org_id, p.id, p_refund_amount_cents,\n'
      || E'         case when coalesce(p.processing_fee_cents, 0) > 0 and p.amount_cents > 0\n'
      || E'              then round(p.processing_fee_cents::numeric * v_new_refunded / p.amount_cents)::integer\n'
      || E'                 - round(p.processing_fee_cents::numeric * v_old_refunded / p.amount_cents)::integer\n'
      || E'              else 0 end,\n'
      || E'         (now() at time zone public.org_timezone(p.org_id))::date,\n'
      || E'         ''refund''\n'
      || E'    from public.crm_payments p\n'
      || E'   where p.id = p_payment_id;\n';
    if (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle) <> 1 then
      raise exception 'refund_payment ledger patch did not match exactly once';
    end if;
    execute replace(v_src, v_needle, v_needle || v_patch);
  end if;

  -- reinstate_stripe_payment_reversal: right after refunded_amount_cents moves down.
  v_src := pg_get_functiondef('public.reinstate_stripe_payment_reversal(uuid,integer)'::regprocedure);
  if position('crm_payment_refunds' in v_src) = 0 then
    v_needle := E'  update public.crm_payments\n  set refunded_amount_cents = v_target,\n      unused_amount_cents   = v_unused + v_delta\n  where id = p_payment_id;\n';
    v_patch :=
         E'\n  -- Dated ledger row (20270106000360): a reinstatement is a negative refund on its own day.\n'
      || E'  insert into public.crm_payment_refunds (org_id, payment_id, amount_cents, fee_cents, refund_date, source)\n'
      || E'  select p.org_id, p.id, -v_delta,\n'
      || E'         case when coalesce(p.processing_fee_cents, 0) > 0 and p.amount_cents > 0\n'
      || E'              then round(p.processing_fee_cents::numeric * v_target / p.amount_cents)::integer\n'
      || E'                 - round(p.processing_fee_cents::numeric * v_refunded / p.amount_cents)::integer\n'
      || E'              else 0 end,\n'
      || E'         (now() at time zone public.org_timezone(p.org_id))::date,\n'
      || E'         ''reinstated''\n'
      || E'    from public.crm_payments p\n'
      || E'   where p.id = p_payment_id;\n';
    if (length(v_src) - length(replace(v_src, v_needle, ''))) / length(v_needle) <> 1 then
      raise exception 'reinstate_stripe_payment_reversal ledger patch did not match exactly once';
    end if;
    execute replace(v_src, v_needle, v_needle || v_patch);
  end if;
end $$;

notify pgrst, 'reload schema';
