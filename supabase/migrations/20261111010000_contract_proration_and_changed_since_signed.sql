-- Contracts: per-contract first-period proration + "changed since signed" flag.
--
-- 1. start_billing_mode — how a contract that starts mid-cycle bills its first
--    stub. 'first_full_cycle' (default) is the pre-existing behaviour, so no
--    existing contract changes. 'prorate_first_period' makes the contract-
--    invoices cron / manual Create Invoices bill a daily-prorated first invoice
--    for the stub (see planFirstPeriodProration in src/lib/contract-billing.ts).
--    first_period_prorated_at is the idempotency marker for that stub invoice.
--
-- 2. changed_since_signed_at — a financial edit to a signed/active contract no
--    longer reverts it to 'sent' (which silently stopped billing). The contract
--    stays signed/active and keeps billing at the new terms; this timestamp
--    drives a "Changed since signed — needs client approval" banner and is
--    cleared when the client approves.
--
-- 3. crm_invoices.proration_period_start/_end — marks the prorated first-period
--    invoice (and the period it covers) so it is excluded from the regular
--    per-period "already billed" idempotency checks.

alter table public.crm_contracts
  add column if not exists start_billing_mode text not null default 'first_full_cycle',
  add column if not exists first_period_prorated_at date,
  add column if not exists changed_since_signed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_contracts_start_billing_mode_check'
      and conrelid = 'public.crm_contracts'::regclass
  ) then
    alter table public.crm_contracts
      add constraint crm_contracts_start_billing_mode_check
      check (start_billing_mode in ('first_full_cycle', 'prorate_first_period'));
  end if;
end $$;

comment on column public.crm_contracts.start_billing_mode is
  'first_full_cycle (default): first invoice is the first regular billing day. prorate_first_period: a mid-cycle start also gets a daily-prorated first-period invoice.';
comment on column public.crm_contracts.first_period_prorated_at is
  'Date the prorated first-period invoice was generated; blocks a second one.';
comment on column public.crm_contracts.changed_since_signed_at is
  'Set when financial terms were edited after the client signed (billing continues at the new terms); cleared when the client approves.';

alter table public.crm_invoices
  add column if not exists proration_period_start date,
  add column if not exists proration_period_end date;

comment on column public.crm_invoices.proration_period_start is
  'Set only on a contract''s prorated first-period invoice: first day of the partial period it bills.';
