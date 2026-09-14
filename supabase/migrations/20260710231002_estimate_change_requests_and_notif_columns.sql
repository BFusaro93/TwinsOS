-- Complete the notifications table's extended schema — several call sites (WO
-- comments, the notifications bell) already read/write type/title/entity_id/
-- entity_type but the columns were never added, so those inserts/queries were
-- silently failing (400s). Adding them here also lets the new estimate change
-- request feature notify staff through the same mechanism.
alter table notifications
  add column if not exists type        text,
  add column if not exists title       text,
  add column if not exists entity_id   uuid,
  add column if not exists entity_type text;

-- Customer-submitted "please change this estimate" requests, left via the
-- public proposal link or client portal.
create table if not exists estimate_change_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  estimate_id    uuid not null references estimates(id),
  client_id      uuid references clients(id),
  message        text not null,
  requester_name text not null,
  requester_email text,
  status         text not null default 'open' check (status in ('open', 'resolved')),
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references profiles(id)
);

create index if not exists estimate_change_requests_estimate_idx on estimate_change_requests(estimate_id);
create index if not exists estimate_change_requests_org_idx on estimate_change_requests(org_id);

alter table estimate_change_requests enable row level security;

create policy "org members manage change requests"
  on estimate_change_requests
  for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));
