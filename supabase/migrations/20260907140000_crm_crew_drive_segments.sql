-- Crew "drive time" tracking: day-level, not tied to any one stop/visit —
-- covers yard-to-first-stop, between-stops, and last-stop-to-yard driving.
-- Paid labor cost (crew gets paid to drive) but never billed to the client
-- and never allocated into any job's actual_labor_cost_cents — see
-- rpt_crew_drive_time (reporting) for where it surfaces instead.
create table if not exists crm_crew_drive_segments (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id() references organizations(id),
  crew_id      uuid not null references crm_crews(id) on delete cascade,
  work_date    date not null,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  minutes      integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references profiles(id)
);

-- At most one open (still-driving) segment per crew at a time — also makes
-- "start drive" idempotent against a double-tap/retry from the client.
create unique index crm_crew_drive_segments_one_open_per_crew
  on crm_crew_drive_segments (crew_id) where ended_at is null;

alter table crm_crew_drive_segments enable row level security;
create policy "org members manage crew drive segments"
  on crm_crew_drive_segments for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_crew_drive_segments (org_id, work_date);
create index on crm_crew_drive_segments (crew_id, work_date);

create trigger set_crm_crew_drive_segments_updated_at
  before update on crm_crew_drive_segments
  for each row execute function set_updated_at();
