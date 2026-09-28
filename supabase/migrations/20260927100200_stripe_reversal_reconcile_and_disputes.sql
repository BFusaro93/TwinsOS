-- Stripe refunds/disputes: converge the ledger on Stripe's own number.
--
-- Two writers reverse a Stripe-backed payment: the staff refund route
-- (/api/crm/payments/[id]/refund) and the Connect webhook (charge.refunded,
-- and now charge.dispute.funds_withdrawn). The route used to call
-- refund_payment(p_payment_id, <requested amount>) as a fresh DELTA after
-- stripe.refunds.create(). A retry inside the idempotency-key window gets the
-- SAME Stripe refund back, but refund_payment ran again — double-reversing
-- the invoice and the client's credit. And the webhook computed its own delta
-- from a separately-read refunded_amount_cents, so the two could interleave.
--
-- reconcile_stripe_payment_reversal() takes the TARGET total reversed at
-- Stripe (charge.amount_refunded, plus any withdrawn dispute amount), clamps
-- it to the payment's net amount (the processing fee has no ledger
-- counterpart — see the webhook's comment), and under the payment row lock
-- applies only target - refunded_amount_cents. Any number of retries, from
-- either writer, in any order, converge on the same state.
--
-- refund_payment() itself is unchanged (still the one place that walks the
-- allocations and reverses invoices) — this is a thin idempotent wrapper.

create or replace function public.reconcile_stripe_payment_reversal(
  p_payment_id            uuid,
  p_target_reversed_cents integer
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_amount   integer;
  v_refunded integer;
  v_target   integer;
  v_delta    integer;
begin
  select p.amount_cents, coalesce(p.refunded_amount_cents, 0)
    into v_amount, v_refunded
    from public.crm_payments p
    where p.id = p_payment_id
    for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  v_target := least(greatest(coalesce(p_target_reversed_cents, 0), 0), v_amount);
  v_delta := v_target - v_refunded;

  if v_delta <= 0 then
    return 0;
  end if;

  perform public.refund_payment(p_payment_id, v_delta);
  return v_delta;
end;
$function$;

revoke execute on function public.reconcile_stripe_payment_reversal(uuid, integer) from public, anon, authenticated;
grant execute on function public.reconcile_stripe_payment_reversal(uuid, integer) to service_role;

comment on function public.reconcile_stripe_payment_reversal(uuid, integer) is
  'Idempotently brings crm_payments.refunded_amount_cents up to Stripe''s reversed total (clamped to amount_cents) via refund_payment(). Service role only.';

-- Dispute tracking. dispute_status mirrors Stripe's Dispute.status verbatim
-- (warning_needs_response, needs_response, under_review, won, lost, ...); no
-- CHECK constraint on purpose — Stripe adds statuses and a rejected write
-- would make the webhook 500 and retry forever.
alter table public.crm_payments
  add column if not exists stripe_dispute_id text,
  add column if not exists dispute_status    text,
  add column if not exists disputed_at       timestamptz;

comment on column public.crm_payments.dispute_status is
  'Stripe Dispute.status for the most recent dispute on this payment''s charge (null = never disputed). Written by the Connect webhook.';
