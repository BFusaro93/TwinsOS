-- Link projects to CRM clients and add progress tracking

alter table projects
  add column if not exists client_id    uuid references clients(id) on delete set null,
  add column if not exists progress_pct numeric(5,2) not null default 0
    check (progress_pct >= 0 and progress_pct <= 100);

create index if not exists idx_projects_client_id on projects(client_id) where deleted_at is null;
