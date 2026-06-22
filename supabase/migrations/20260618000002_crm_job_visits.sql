create table crm_job_visits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id(),
  job_id          uuid not null references crm_jobs(id) on delete cascade,
  client_id       uuid not null references clients(id),
  crew_id         uuid references crm_crews(id),
  scheduled_date  date not null,
  start_time      time,
  end_time        time,
  status          text not null default 'scheduled'
                    check (status in ('scheduled','in_progress','completed','cancelled','skipped')),
  completion_notes text,
  actual_hours    numeric,
  completed_at    timestamptz,
  priority        integer not null default 1,
  notes_to_crew   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  created_by      uuid references profiles(id)
);

alter table crm_job_visits enable row level security;
create policy "org members select visits"  on crm_job_visits for select  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members insert visits"  on crm_job_visits for insert  with check (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members update visits"  on crm_job_visits for update  using (org_id = (select org_id from profiles where id = auth.uid()));
create policy "org members delete visits"  on crm_job_visits for delete  using (org_id = (select org_id from profiles where id = auth.uid()));

create index on crm_job_visits (org_id, scheduled_date) where deleted_at is null;
create index on crm_job_visits (job_id);
create index on crm_job_visits (client_id);

create trigger set_crm_job_visits_updated_at
  before update on crm_job_visits
  for each row execute function set_updated_at();
