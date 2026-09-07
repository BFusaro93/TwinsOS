-- pm_schedules.assigned_to_id/assigned_to_name exist live on both prod and
-- test but no migration file ever creates them (only
-- 20260901030000_pm_schedules_assigned_to_fk_target_employees.sql touches
-- them, and only to retarget the FK — it assumes the columns already exist).
-- Same untracked-schema-drift pattern as 20260721190552 and others: a fresh
-- environment built from `supabase db reset`/`db push` alone would be
-- missing these columns entirely. Guarded with IF NOT EXISTS since they're
-- already live everywhere this has been applied — a no-op there.
alter table pm_schedules
  add column if not exists assigned_to_id uuid references crm_employees(id) on delete set null,
  add column if not exists assigned_to_name text;
