-- Skipped dates: specific dates a recurring schedule should NOT produce (e.g. skip one Monday
-- for a holiday). Applies to every frequency; ignored by 'custom' schedules, which just
-- don't include the date.
alter table public.crm_schedules
  add column if not exists excluded_dates date[] not null default '{}';
