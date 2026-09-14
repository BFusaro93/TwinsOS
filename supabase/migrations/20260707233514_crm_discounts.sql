-- CRM Discounts: named discounts with a real rate (percent or flat amount),
-- replacing the old name-only, non-persisted stub in Settings > Accounting.

create table if not exists crm_discounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default my_org_id(),
  name          text not null,
  discount_type text not null default 'percent' check (discount_type in ('percent', 'flat')),
  percent_bps   integer,
  flat_cents    integer,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint crm_discounts_amount_check check (
    (discount_type = 'percent' and percent_bps is not null and percent_bps > 0 and flat_cents is null) or
    (discount_type = 'flat' and flat_cents is not null and flat_cents > 0 and percent_bps is null)
  )
);

alter table crm_discounts enable row level security;
create policy "org members select discounts" on crm_discounts for select using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members insert discounts" on crm_discounts for insert with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members update discounts" on crm_discounts for update using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members delete discounts" on crm_discounts for delete using (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_discounts (org_id) where deleted_at is null;

create trigger set_crm_discounts_updated_at
  before update on crm_discounts
  for each row execute function set_updated_at();
