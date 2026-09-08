-- Crew "take a break" support: lets a crew pause an in-progress stop (lunch,
-- stopping for the day) without completing/billing it, then resume later.
-- paused_at is set while on break and cleared on resume; break_minutes
-- accumulates total break time across possibly multiple pauses so the final
-- clock-out can subtract it from the billed/actual duration.
alter table crm_job_visits
  add column if not exists paused_at     timestamptz,
  add column if not exists break_minutes integer not null default 0;
