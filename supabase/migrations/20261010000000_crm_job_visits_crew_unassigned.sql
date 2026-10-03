-- Per-visit "unassigned" override.
--
-- crm_job_visits.crew_id NULL normally means "inherit the job's crew"
-- (effective crew = coalesce(visit.crew_id, job.crew_id)). That made it
-- impossible to take ONE inherited visit off its crew without changing the
-- whole job. crew_unassigned = true pins the visit to "no crew" regardless of
-- the job's crew:
--   effective crew = CASE WHEN crew_unassigned THEN NULL
--                         ELSE coalesce(crew_id, job.crew_id) END
-- Setting an explicit crew_id on a visit clears the flag (enforced by the
-- trigger below as a backstop to the application code).
ALTER TABLE public.crm_job_visits
  ADD COLUMN IF NOT EXISTS crew_unassigned boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.crm_job_visits_crew_unassigned_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- An explicit crew and "unassigned" are mutually exclusive; an explicit
  -- crew wins (assigning a crew is the more recent, deliberate intent).
  IF NEW.crew_id IS NOT NULL THEN
    NEW.crew_unassigned := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_job_visits_crew_unassigned_sync ON public.crm_job_visits;
CREATE TRIGGER crm_job_visits_crew_unassigned_sync
  BEFORE INSERT OR UPDATE OF crew_id, crew_unassigned ON public.crm_job_visits
  FOR EACH ROW EXECUTE FUNCTION public.crm_job_visits_crew_unassigned_sync();
