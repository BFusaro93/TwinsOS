-- Add detail fields to crm_crews (SA Team Details tab)
alter table crm_crews
  add column if not exists tags            text[],
  add column if not exists route_sheet_format text,
  add column if not exists map_icon_color  text,
  add column if not exists map_codes       text,
  add column if not exists show_in_calendar boolean not null default true,
  add column if not exists starting_address text,
  add column if not exists starting_city   text,
  add column if not exists starting_state  text,
  add column if not exists starting_zip    text,
  add column if not exists starting_lat    numeric(12,8),
  add column if not exists starting_lng    numeric(12,8);

-- Add days_of_week to crew member assignments (0=Sun .. 6=Sat)
alter table crm_crew_members
  add column if not exists days_of_week integer[] not null default '{0,1,2,3,4,5,6}';

-- Link employees to auth users (optional — field crew may have no login)
alter table crm_employees
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists crm_employees_user_id_unique
  on crm_employees (user_id) where user_id is not null;
