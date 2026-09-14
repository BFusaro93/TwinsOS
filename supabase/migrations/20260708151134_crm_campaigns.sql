-- CRM Sales Campaigns
create table if not exists crm_campaigns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  status        text not null default 'draft' check (status in ('draft','scheduled','sending','active','paused','completed','cancelled')),
  type          text not null default 'email' check (type in ('email','sms','postcard')),
  target_segment text not null default 'all_clients' check (target_segment in ('all_clients','active_clients','leads','past_clients','custom')),
  subject       text,
  body          text,
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  total_recipients integer default 0,
  delivered_count  integer default 0,
  opened_count     integer default 0,
  clicked_count    integer default 0,
  unsubscribed_count integer default 0,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

alter table crm_campaigns enable row level security;

create policy "org members can manage campaigns"
  on crm_campaigns for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

create index crm_campaigns_org_idx on crm_campaigns(org_id) where deleted_at is null;
