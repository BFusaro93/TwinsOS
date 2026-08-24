-- ── crm_employees ─────────────────────────────────────────────────────────────

create table if not exists crm_employees (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id) on delete set null,
  deleted_at            timestamptz,

  -- Personal Information
  first_name            text not null,
  middle_initial        text,
  last_name             text not null,
  print_on_check_as     text,
  email                 text,
  birth_date            date,
  resource_code         text,
  address               text,
  city                  text,
  state                 text,
  zip                   text,
  driver_license        text,
  is_certified_driver   boolean not null default false,
  license_expiration    date,
  insurance_eligibility date,
  covered_by_insurance  boolean not null default false,
  applicator_license    text,
  resource_tags         text[],

  -- Employment
  date_hired            date,
  phone                 text,
  cell_phone            text,
  pager                 text,
  marital_status        text check (marital_status in ('single','married','divorced','widowed')),
  spouse_name           text,
  i9_number             text,
  date_released         date,
  reason_for_release    text,
  citizenship           text,
  emergency_phone       text,
  emergency_contact     text,
  num_dependants        integer not null default 0,
  spouse_phone          text,
  i9_expiration_date    date,
  rehire_date           date,
  employment_status     text not null default 'full_time'
    check (employment_status in ('full_time','part_time','seasonal','contractor','terminated')),
  manager_id            uuid references crm_employees(id) on delete set null,

  -- Payroll / Job Costing
  compensation_type     text check (compensation_type in ('hourly','salary','commission','1099')),
  resource_pin          text,
  eligible_overtime     boolean not null default false,
  hourly_rate_cents     integer not null default 0,
  overtime_rate_cents   integer not null default 0,
  vacation_days         integer not null default 0,
  sick_days             integer not null default 0,
  commission_pct        numeric(5,2) not null default 0,
  payment_frequency     text check (payment_frequency in ('weekly','biweekly','semimonthly','monthly')),
  last_pay_raise_cents  integer not null default 0,
  last_pay_raise_date   date,

  -- User / App Settings
  user_type             text not null default 'field' check (user_type in ('full_user','field','view_only','no_access')),
  show_in_selection     boolean not null default true,
  show_in_calendar      boolean not null default true,
  field_time_clock      boolean not null default true,
  office_time_clock     boolean not null default false,
  send_text_alerts      boolean not null default false,
  user_role             text,
  route_sheet_format    text,
  map_icon_color        text,
  map_codes             text,
  is_sales_rep          boolean not null default false,
  starting_address      text,
  starting_city         text,
  starting_state        text,
  starting_zip          text,
  starting_lat          numeric(12,8),
  starting_lng          numeric(12,8),

  notes                 text,
  is_active             boolean not null default true
);

-- trigger to keep updated_at current
create trigger set_crm_employees_updated_at
  before update on crm_employees
  for each row execute function set_updated_at();

-- RLS
alter table crm_employees enable row level security;

create policy "org members can view employees"
  on crm_employees for select
  using (org_id = my_org_id());

create policy "org members can insert employees"
  on crm_employees for insert
  with check (org_id = my_org_id());

create policy "org members can update employees"
  on crm_employees for update
  using (org_id = my_org_id());

-- ── crm_crew_members ──────────────────────────────────────────────────────────

create table if not exists crm_crew_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  crew_id     uuid not null references crm_crews(id) on delete cascade,
  employee_id uuid not null references crm_employees(id) on delete cascade,
  is_foreman  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (crew_id, employee_id)
);

alter table crm_crew_members enable row level security;

create policy "org members can manage crew members"
  on crm_crew_members for all
  using (org_id = my_org_id())
  with check (org_id = my_org_id());

-- Add foreman_id shortcut to crm_crews
alter table crm_crews
  add column if not exists foreman_id uuid references crm_employees(id) on delete set null,
  add column if not exists code       text;
