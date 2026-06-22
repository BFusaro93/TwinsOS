-- CRM Module: Sprint 2
-- Tables: crm_services, crm_crews, crm_crew_members, crm_jobs, crm_job_services

-- ─── crm_services ─────────────────────────────────────────────────────────────
-- Service catalog (Mow, Fert Step 1, Hedge Trim, etc.)
create table if not exists crm_services (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id() references organizations(id),
  name            text not null,
  code            text,                         -- short code, e.g. STEP3:7, MOSTICK3:8
  category        text not null default 'general'
                    check (category in ('lawn','fertilization','snow','construction','irrigation','cleanup','general')),
  default_rate_cents integer,                   -- default per-visit rate in cents
  -- estimating engine inputs (Sprint 3)
  production_rate_sqft_per_hr numeric,          -- sq ft per man-hour
  unit             text default 'visit'         -- 'visit','sqft','hour','lb'
                    check (unit in ('visit','sqft','hour','lb','yard')),
  is_active        boolean not null default true,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid references profiles(id)
);

create index on crm_services (org_id) where deleted_at is null;
alter table crm_services enable row level security;

create policy "org members can manage crm_services"
  on crm_services for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── crm_crews ────────────────────────────────────────────────────────────────
create table if not exists crm_crews (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id),
  name        text not null,                    -- e.g. "FERT1", "CREW2"
  color       text,                             -- hex color for dispatch calendar
  is_active   boolean not null default true,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references profiles(id)
);

create index on crm_crews (org_id) where deleted_at is null;
alter table crm_crews enable row level security;

create policy "org members can manage crm_crews"
  on crm_crews for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── crm_crew_members ─────────────────────────────────────────────────────────
create table if not exists crm_crew_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id),
  crew_id     uuid not null references crm_crews(id),
  name        text not null,
  role        text default 'member' check (role in ('lead','member')),
  created_at  timestamptz not null default now()
);

create index on crm_crew_members (org_id, crew_id);
alter table crm_crew_members enable row level security;

create policy "org members can manage crm_crew_members"
  on crm_crew_members for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── crm_jobs ─────────────────────────────────────────────────────────────────
create table if not exists crm_jobs (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default my_org_id() references organizations(id),
  job_number          serial,                   -- display number per org
  client_id           uuid not null references clients(id),
  property_id         uuid references client_properties(id),
  job_type            text not null default 'one_time'
                        check (job_type in ('recurring','one_time','waiting_list','package','snow','project')),
  status              text not null default 'scheduled'
                        check (status in ('scheduled','in_progress','completed','cancelled','skipped','hold')),
  sub_status          text,                     -- free-form sub-status label
  -- scheduling
  scheduled_date      date,                     -- null for waiting_list jobs
  start_time          time,
  end_time            time,
  waiting_list_start  date,                     -- waiting_list: earliest acceptable date
  waiting_list_end    date,                     -- waiting_list: latest acceptable date
  -- recurrence (recurring jobs only) — RFC 5545 style
  recurrence_rule     text,                     -- e.g. 'FREQ=WEEKLY;BYDAY=TH'
  recurrence_start    date,
  recurrence_end      date,
  -- package (package jobs only)
  package_id          uuid,                     -- references crm_packages (Sprint 3)
  package_step        integer,                  -- e.g. 3 (of 7)
  package_total_steps integer,                  -- e.g. 7
  -- assignment
  crew_id             uuid references crm_crews(id),
  man_count           integer default 1,
  -- financials
  rate_cents          integer,                  -- total job rate
  budgeted_hours      numeric,
  actual_hours        numeric,
  -- location snapshot (denormalized from property for dispatch speed)
  service_address     text,
  service_city        text,
  service_state       text,
  service_zip         text,
  map_code            text,
  -- last service info
  last_service_date   date,
  -- notes
  notes_to_crew       text,
  completion_notes    text,
  -- project link (project-type jobs)
  project_id          uuid,                     -- references po projects (integration point)
  -- priority
  priority            integer default 1,        -- dispatch sort order
  -- soft delete + audit
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid references profiles(id)
);

create index on crm_jobs (org_id, scheduled_date) where deleted_at is null;
create index on crm_jobs (org_id, client_id) where deleted_at is null;
create index on crm_jobs (org_id, status) where deleted_at is null;
create index on crm_jobs (org_id, job_type) where deleted_at is null;

alter table crm_jobs enable row level security;

create policy "org members can read crm_jobs"
  on crm_jobs for select
  using (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can insert crm_jobs"
  on crm_jobs for insert
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create policy "org members can update crm_jobs"
  on crm_jobs for update
  using (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── crm_job_services ─────────────────────────────────────────────────────────
-- A job can include multiple services (e.g. mow + edge + blow)
create table if not exists crm_job_services (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default my_org_id() references organizations(id),
  job_id      uuid not null references crm_jobs(id) on delete cascade,
  service_id  uuid references crm_services(id),
  service_name text not null,                   -- snapshot at time of job creation
  qty         numeric default 1,
  rate_cents  integer,
  created_at  timestamptz not null default now()
);

create index on crm_job_services (org_id, job_id);
alter table crm_job_services enable row level security;

create policy "org members can manage crm_job_services"
  on crm_job_services for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

-- ─── updated_at triggers ──────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_crm_services_updated_at') then
    create trigger set_crm_services_updated_at
      before update on crm_services
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_crm_crews_updated_at') then
    create trigger set_crm_crews_updated_at
      before update on crm_crews
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'set_crm_jobs_updated_at') then
    create trigger set_crm_jobs_updated_at
      before update on crm_jobs
      for each row execute function set_updated_at();
  end if;
end;
$$;
