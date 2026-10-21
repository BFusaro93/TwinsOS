-- Crew-leader day clock + editable payroll.
--
-- 1. crm_crew_day_shifts: the PAID day, shop to shop. The crew leader taps
--    Start Day / End Day once and every working member gets a shift row.
--    Stop punches (crm_crew_member_times) stay job-level for Job Costing.
-- 2. crm_crew_day_absences: a member the leader marked "not working" for a
--    day. Start Day / Start Job skip them; late arrivals are clocked in later.
-- 3. crm_payroll_adjustments: the office's payroll-only edits per member per
--    day. Shift and punch rows are never rewritten, so Job Costing and the
--    dispatch board keep the raw numbers.

create table if not exists crm_crew_day_shifts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id() references organizations(id),
  crew_member_id  uuid not null references crm_crew_members(id) on delete cascade,
  work_date       date not null,
  started_at      timestamptz not null,
  ended_at        timestamptz,
  -- Unpaid time off the clock (lunch) beyond the stop pauses already recorded.
  break_minutes   integer not null default 0 check (break_minutes >= 0),
  -- crew: leader tapped Start Day; auto_first_job: leader skipped it and the
  -- first Start Job opened the day; office: entered by staff.
  source          text not null default 'crew' check (source in ('crew', 'auto_first_job', 'office')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id),
  deleted_at      timestamptz,
  check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists crm_crew_day_shifts_member_day
  on crm_crew_day_shifts (crew_member_id, work_date) where deleted_at is null;
create index if not exists crm_crew_day_shifts_org_date
  on crm_crew_day_shifts (org_id, work_date);

alter table crm_crew_day_shifts enable row level security;
create policy "org members manage crew day shifts"
  on crm_crew_day_shifts for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_crew_day_shifts_updated_at
  before update on crm_crew_day_shifts
  for each row execute function set_updated_at();

create table if not exists crm_crew_day_absences (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id() references organizations(id),
  crew_member_id  uuid not null references crm_crew_members(id) on delete cascade,
  work_date       date not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id),
  deleted_at      timestamptz
);

create unique index if not exists crm_crew_day_absences_member_day
  on crm_crew_day_absences (crew_member_id, work_date) where deleted_at is null;
create index if not exists crm_crew_day_absences_org_date
  on crm_crew_day_absences (org_id, work_date);

alter table crm_crew_day_absences enable row level security;
create policy "org members manage crew day absences"
  on crm_crew_day_absences for all
  using (org_id = (select org_id from profiles where id = auth.uid()))
  with check (org_id = (select org_id from profiles where id = auth.uid()));

create trigger set_crm_crew_day_absences_updated_at
  before update on crm_crew_day_absences
  for each row execute function set_updated_at();

create table if not exists crm_payroll_adjustments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default my_org_id() references organizations(id),
  crew_member_id  uuid not null references crm_crew_members(id) on delete cascade,
  work_date       date not null,
  -- NULL = use the computed shift hours; a number replaces them for payroll.
  hours_override  numeric(6,2) check (hours_override is null or hours_override >= 0),
  -- Corrected clock times / unpaid break for the day. NULL = use the recorded
  -- shift. Hours are recomputed from these; hours_override still wins last.
  start_override  timestamptz,
  end_override    timestamptz,
  break_override  integer check (break_override is null or break_override >= 0),
  -- Hours with no punch behind them: shop time, PTO, training, etc.
  extra_hours     numeric(6,2) not null default 0 check (extra_hours >= 0),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id),
  updated_by      uuid references profiles(id),
  deleted_at      timestamptz
);

create unique index if not exists crm_payroll_adjustments_member_day
  on crm_payroll_adjustments (org_id, crew_member_id, work_date) where deleted_at is null;
create index if not exists crm_payroll_adjustments_org_date
  on crm_payroll_adjustments (org_id, work_date);

alter table crm_payroll_adjustments enable row level security;
-- Office roles only: crew logins must never read or edit payroll.
create policy "office manages payroll adjustments"
  on crm_payroll_adjustments for all
  using (
    org_id = (select org_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('admin', 'manager')
  )
  with check (
    org_id = (select org_id from profiles where id = auth.uid())
    and (select role from profiles where id = auth.uid()) in ('admin', 'manager')
  );

create trigger set_crm_payroll_adjustments_updated_at
  before update on crm_payroll_adjustments
  for each row execute function set_updated_at();
