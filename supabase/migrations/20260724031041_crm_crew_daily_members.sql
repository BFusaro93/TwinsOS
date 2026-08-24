-- Per-day crew roster override. crm_crew_members is the PERMANENT default
-- roster (managed in Team settings); this table lets the dispatch board's
-- Team Assignment dialog move an employee onto a different crew for a single
-- work date without touching their permanent crew assignment.
create table if not exists crm_crew_daily_members (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id() references organizations(id),
  work_date    date not null,
  crew_id      uuid not null references crm_crews(id) on delete cascade,
  member_id    uuid not null references crm_crew_members(id) on delete cascade,
  created_at   timestamptz not null default now(),
  created_by   uuid references profiles(id),
  unique (work_date, member_id)
);

alter table crm_crew_daily_members enable row level security;
create policy "org members manage crew daily overrides"
  on crm_crew_daily_members for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_crew_daily_members (org_id, work_date);
create index on crm_crew_daily_members (member_id);
