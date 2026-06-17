-- Add "pending" as a valid status for photo_jobs.
-- Pending = scheduled/waiting-list jobs not yet active; keeps Active list clean for crews.
ALTER TABLE public.photo_jobs
  DROP CONSTRAINT IF EXISTS photo_jobs_status_check;

ALTER TABLE public.photo_jobs
  ADD CONSTRAINT photo_jobs_status_check
  CHECK (status IN ('active', 'complete', 'on_hold', 'pending'));
