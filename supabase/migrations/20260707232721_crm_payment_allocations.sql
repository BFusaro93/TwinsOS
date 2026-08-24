-- crm_payments only ever stored a single optional invoice_id (set only when
-- exactly one invoice was allocated) plus the payment's total amount_cents.
-- There was no record of exactly which invoices a multi-invoice payment
-- applied to, or how much went to each. Editing a payment reconstructed the
-- allocation UI by guessing: any OTHER invoice for the client that happened
-- to be fully "paid" (by any payment, not necessarily this one) was assumed
-- to have been paid by the payment being edited. This produced wrong
-- allocations whenever a client had more than one paid invoice.
--
-- It also meant editing a multi-invoice payment never reversed the original
-- invoice balances at all (only single-invoice payments had an invoice_id to
-- reverse), risking double-counting on save.
--
-- Fix: record exact allocations at write time and use them (not guesses) to
-- reconstruct and reverse allocations on edit.

create table if not exists crm_payment_allocations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) default my_org_id(),
  payment_id   uuid not null references crm_payments(id) on delete cascade,
  invoice_id   uuid not null references crm_invoices(id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  created_at   timestamptz not null default now()
);

create index if not exists crm_payment_allocations_payment_id_idx on crm_payment_allocations (payment_id);
create index if not exists crm_payment_allocations_invoice_id_idx on crm_payment_allocations (invoice_id);

alter table crm_payment_allocations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'crm_payment_allocations' and policyname = 'org members can read payment allocations') then
    create policy "org members can read payment allocations" on crm_payment_allocations for select using (org_id = my_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_payment_allocations' and policyname = 'org members can insert payment allocations') then
    create policy "org members can insert payment allocations" on crm_payment_allocations for insert with check (org_id = my_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'crm_payment_allocations' and policyname = 'org members can delete payment allocations') then
    create policy "org members can delete payment allocations" on crm_payment_allocations for delete using (org_id = my_org_id());
  end if;
end $$;
