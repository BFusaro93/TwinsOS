-- Drop "on_hold" status from photo_jobs — simplify to active / pending / complete.
-- Migrate any existing on_hold jobs to pending (not yet active = same intent).
UPDATE public.photo_jobs SET status = 'pending' WHERE status = 'on_hold';

ALTER TABLE public.photo_jobs DROP CONSTRAINT IF EXISTS photo_jobs_status_check;
ALTER TABLE public.photo_jobs
  ADD CONSTRAINT photo_jobs_status_check
  CHECK (status IN ('active', 'complete', 'pending'));
