-- Payment-plan flexibility for estimates: monthly installments assume equal
-- recurring payments, which doesn't fit project-style work billed by
-- milestone (deposit / progress / completion). Add a payment_plan_type
-- switch, a day-of-month override for the installment schedule, and a
-- separate estimate_milestones table for the milestone alternative.

alter table estimates
  add column if not exists payment_plan_type text not null default 'installments'
    check (payment_plan_type in ('installments', 'milestones')),
  add column if not exists installment_day_of_month integer
    check (installment_day_of_month is null or installment_day_of_month between 1 and 31);

create table if not exists estimate_milestones (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id() references organizations(id) on delete cascade,
  estimate_id     uuid not null references estimates(id) on delete cascade,
  name            text not null,
  milestone_type  text not null default 'percent' check (milestone_type in ('flat', 'percent')),
  milestone_value integer not null default 0, -- cents if flat, basis points (0-10000) if percent
  amount_cents    integer not null default 0, -- snapshotted dollar amount actually billed
  sort_order      integer not null default 0,
  status          text not null default 'pending' check (status in ('pending', 'invoiced')),
  invoice_id      uuid references crm_invoices(id) on delete set null,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id)
);

create index on estimate_milestones (org_id, estimate_id) where deleted_at is null;

alter table estimate_milestones enable row level security;

create policy "org members can read estimate_milestones"
  on estimate_milestones for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert estimate_milestones"
  on estimate_milestones for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update estimate_milestones"
  on estimate_milestones for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

do $do$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_estimate_milestones_updated_at') then
    create trigger set_estimate_milestones_updated_at
      before update on estimate_milestones
      for each row execute function set_updated_at();
  end if;
end
$do$;
