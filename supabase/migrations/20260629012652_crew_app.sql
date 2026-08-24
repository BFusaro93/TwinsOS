-- Crew App: clock-in/out tracking on visits, visit photos, crew member time records

-- ─── crm_job_visits additions ─────────────────────────────────────────────────
alter table crm_job_visits
  add column if not exists clocked_in_at       timestamptz,
  add column if not exists clocked_out_at      timestamptz,
  add column if not exists acknowledged_notes_at timestamptz,
  add column if not exists skip_reason         text,
  add column if not exists dispatched_at       timestamptz,
  add column if not exists sub_status          text,
  add column if not exists assigned_employee_id uuid references profiles(id),
  add column if not exists notes_to_client     text,
  add column if not exists invoice_description text,
  add column if not exists job_comments        text,
  add column if not exists men_count           integer not null default 1,
  add column if not exists qty                 numeric,
  add column if not exists rate_cents          integer;

-- ─── crm_visit_photos ─────────────────────────────────────────────────────────
create table if not exists crm_visit_photos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null default my_org_id(),
  visit_id     uuid not null references crm_job_visits(id) on delete cascade,
  job_id       uuid not null references crm_jobs(id) on delete cascade,
  storage_path text not null,
  caption      text,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now()
);

alter table crm_visit_photos enable row level security;
create policy "org members select visit photos"  on crm_visit_photos for select  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members insert visit photos"  on crm_visit_photos for insert  with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members delete visit photos"  on crm_visit_photos for delete  using (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_visit_photos (org_id, visit_id);
create index on crm_visit_photos (job_id);

-- ─── crm_crew_member_times ────────────────────────────────────────────────────
-- Individual crew member clock-in/out per visit (for payroll accuracy)
create table if not exists crm_crew_member_times (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id(),
  visit_id        uuid not null references crm_job_visits(id) on delete cascade,
  crew_member_id  uuid not null references crm_crew_members(id) on delete cascade,
  clocked_in_at   timestamptz,
  clocked_out_at  timestamptz,
  break_minutes   integer not null default 0,
  lunch_minutes   integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table crm_crew_member_times enable row level security;
create policy "org members manage crew member times"
  on crm_crew_member_times for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_crew_member_times (org_id, visit_id);
create index on crm_crew_member_times (crew_member_id);

create trigger set_crm_crew_member_times_updated_at
  before update on crm_crew_member_times
  for each row execute function set_updated_at();
