-- Extend crm_services with SA-parity fields
alter table crm_services
  add column if not exists parent_service_id          uuid references crm_services(id) on delete set null,
  add column if not exists service_mode               text not null default 'flat_rate'
    check (service_mode in ('flat_rate','hourly','per_unit')),
  add column if not exists default_b_hrs              numeric(6,2) not null default 0,
  add column if not exists default_b_cost_cents       integer not null default 0,
  add column if not exists show_in_snow_dispatch      boolean not null default false,
  add column if not exists only_for_estimates         boolean not null default false,
  add column if not exists track_chemicals            boolean not null default false,
  add column if not exists invoice_description        text,
  add column if not exists description_on_estimate    text,
  add column if not exists task_color                 text default '#3B82F6',
  add column if not exists target_rate_cents          integer not null default 0,
  add column if not exists target_rate_with_drive_cents integer not null default 0,
  add column if not exists rate_matrix_field          text,  -- e.g. 'turf_sqft', 'total_sqft'
  add column if not exists rate_matrix_calc           text default 'qty_x_rate_x_visits',
  -- Tail rule: "Every X over Y is $Z more and H hrs with cost C"
  add column if not exists matrix_tail_every_qty      numeric(10,2),
  add column if not exists matrix_tail_over_qty       numeric(10,2),
  add column if not exists matrix_tail_rate_cents     integer,
  add column if not exists matrix_tail_hours          numeric(6,2),
  add column if not exists matrix_tail_cost_cents     integer;

-- Rate matrix: area tier → rate + budgeted hours + budgeted cost
create table if not exists crm_service_rate_matrix (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  service_id           uuid not null references crm_services(id) on delete cascade,
  from_qty             numeric(10,2) not null,
  to_qty               numeric(10,2) not null,
  rate_cents           integer not null default 0,
  budgeted_hours       numeric(6,2) not null default 0,
  budgeted_cost_cents  integer not null default 0,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table crm_service_rate_matrix enable row level security;

create policy "org members can manage rate matrix"
  on crm_service_rate_matrix for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());
