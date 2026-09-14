-- useAddJobsToStormEvent (src/lib/hooks/use-snow-dispatch.ts) inserts one
-- crm_job_visits row per selected job with no check for an existing
-- (job_id, storm_event_id) row. Re-opening "Add Jobs to Dispatch" for a
-- storm event already in progress (e.g. after a forecast revision) and
-- resubmitting an overlapping selection creates a second visit for the same
-- job on the same storm — exactly the double-billing/double-dispatch this
-- feature's own snow-invoicing code comments say must not happen. Enforce
-- it at the data layer as the authoritative guard, since the UI's
-- candidate list can't be trusted to always exclude already-added jobs.
CREATE UNIQUE INDEX IF NOT EXISTS crm_job_visits_job_storm_event_unique
  ON public.crm_job_visits (job_id, storm_event_id)
  WHERE storm_event_id IS NOT NULL AND deleted_at IS NULL;
