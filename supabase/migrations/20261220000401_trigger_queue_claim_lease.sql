-- crm_automation_trigger_queue rows were read and fired without being claimed, so the
-- 15-minute cron and a member running /api/automations/run by hand (e.g. after a meter
-- reading) could fire the same queued event at once. Enrollment is deduped, but each
-- run notified Zapier REST-hook subscribers again. drainTriggerQueue now claims a row
-- (conditional update of claimed_until) before firing it; a run that dies mid-row
-- releases it when the lease runs out.
alter table public.crm_automation_trigger_queue
  add column if not exists claimed_until timestamptz;
